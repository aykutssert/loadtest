package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Task struct {
	TestID         string            `json:"testId"`
	TargetURL      string            `json:"targetUrl"`
	RequestCount   int               `json:"requestCount"`
	Concurrency    int               `json:"concurrency"`
	Method         string            `json:"method"`
	RampUpSeconds  int               `json:"rampUpSeconds"`
	TimeoutSeconds int               `json:"timeoutSeconds"`
	Headers        map[string]string `json:"headers"`
	Body           string            `json:"body"`
}

type requestResult struct {
	latencyMs  int64
	statusCode int
	isError    bool
}

type LatencyStats struct {
	P50 float64 `bson:"p50"`
	P90 float64 `bson:"p90"`
	P99 float64 `bson:"p99"`
	Min float64 `bson:"min"`
	Max float64 `bson:"max"`
	Avg float64 `bson:"avg"`
}

type TestResults struct {
	TotalRequests   int            `bson:"totalRequests"`
	SuccessCount    int            `bson:"successCount"`
	ErrorCount      int            `bson:"errorCount"`
	ErrorRate       float64        `bson:"errorRate"`
	DurationSeconds float64        `bson:"durationSeconds"`
	Rps             float64        `bson:"rps"`
	Latency         LatencyStats   `bson:"latency"`
	StatusCodes     map[string]int `bson:"statusCodes"`
}

func main() {
	rabbitURL := fmt.Sprintf("amqp://%s:%s@%s:%s/",
		getEnv("RABBITMQ_USER", "guest"),
		getEnv("RABBITMQ_PASS", "guest"),
		getEnv("RABBITMQ_HOST", "localhost"),
		getEnv("RABBITMQ_PORT", "5672"),
	)
	mongoURL := getEnv("MONGODB_URL", "mongodb://root:password@localhost:27017/")

	mongoClient, err := connectMongo(mongoURL)
	if err != nil {
		log.Fatalf("MongoDB connection failed: %v", err)
	}
	defer mongoClient.Disconnect(context.Background())
	col := mongoClient.Database("loadtest").Collection("tests")

	ttl := int32(30 * 24 * 60 * 60)
	col.Indexes().CreateOne(context.Background(), mongo.IndexModel{
		Keys:    bson.D{{Key: "createdAt", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(ttl),
	})

	log.Println("Worker ready — waiting for tasks")

	for {
		runConsumer(rabbitURL, col)
		log.Println("RabbitMQ connection lost — reconnecting in 5s")
		time.Sleep(5 * time.Second)
	}
}

func runConsumer(rabbitURL string, col *mongo.Collection) {
	conn, err := connectRabbit(rabbitURL)
	if err != nil {
		return
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		log.Printf("Failed to open channel: %v", err)
		return
	}
	defer ch.Close()

	ch.QueueDeclare("loadtest_tasks", true, false, false, false, nil)
	ch.Qos(1, 0, false)

	msgs, err := ch.Consume("loadtest_tasks", "", false, false, false, false, nil)
	if err != nil {
		log.Printf("Failed to register consumer: %v", err)
		return
	}

	for msg := range msgs {
		var task Task
		if err := json.Unmarshal(msg.Body, &task); err != nil {
			log.Printf("Failed to parse task: %v", err)
			msg.Nack(false, false)
			continue
		}

		log.Printf("Starting test %s → %s  requests=%d concurrency=%d timeout=%ds",
			task.TestID, task.TargetURL, task.RequestCount, task.Concurrency, task.TimeoutSeconds)

		col.UpdateOne(context.Background(),
			bson.M{"_id": task.TestID},
			bson.M{"$set": bson.M{"status": "running"}})

		results, duration, err := runTest(task)
		if err != nil {
			log.Printf("Test %s failed: %v", task.TestID, err)
			col.UpdateOne(context.Background(),
				bson.M{"_id": task.TestID},
				bson.M{"$set": bson.M{"status": "failed"}})
			msg.Ack(false)
			continue
		}

		metrics := calculateMetrics(results, duration)

		col.UpdateOne(context.Background(),
			bson.M{"_id": task.TestID},
			bson.M{"$set": bson.M{
				"status":      "completed",
				"completedAt": time.Now(),
				"results":     metrics,
			}})

		log.Printf("Test %s done — RPS=%.1f P50=%.0fms P99=%.0fms errors=%.1f%%",
			task.TestID, metrics.Rps, metrics.Latency.P50, metrics.Latency.P99, metrics.ErrorRate)

		msg.Ack(false)
	}
}

func runTest(task Task) ([]requestResult, float64, error) {
	if task.Concurrency <= 0 {
		task.Concurrency = 10
	}
	if task.TimeoutSeconds <= 0 {
		task.TimeoutSeconds = 30
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	client := &http.Client{Timeout: time.Duration(task.TimeoutSeconds) * time.Second}
	results := make([]requestResult, 0, task.RequestCount)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, task.Concurrency)

	var rampDelay time.Duration
	if task.RampUpSeconds > 0 {
		rampDelay = time.Duration(float64(task.RampUpSeconds) / float64(task.Concurrency) * float64(time.Second))
	}

	start := time.Now()

loop:
	for i := 0; i < task.RequestCount; i++ {
		if rampDelay > 0 && i < task.Concurrency {
			select {
			case <-time.After(rampDelay):
			case <-ctx.Done():
				break loop
			}
		}

		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			break loop
		}

		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			var bodyReader *strings.Reader
			if task.Body != "" {
				bodyReader = strings.NewReader(task.Body)
			}

			var req *http.Request
			var err error
			if bodyReader != nil {
				req, err = http.NewRequestWithContext(ctx, task.Method, task.TargetURL, bodyReader)
			} else {
				req, err = http.NewRequestWithContext(ctx, task.Method, task.TargetURL, nil)
			}
			if err != nil {
				mu.Lock()
				results = append(results, requestResult{isError: true})
				mu.Unlock()
				return
			}

			for k, v := range task.Headers {
				req.Header.Set(k, v)
			}

			t := time.Now()
			resp, err := client.Do(req)
			latency := time.Since(t).Milliseconds()

			r := requestResult{latencyMs: latency}
			if err != nil {
				r.isError = true
			} else {
				r.statusCode = resp.StatusCode
				resp.Body.Close()
			}

			mu.Lock()
			results = append(results, r)
			mu.Unlock()
		}()
	}

	wg.Wait()

	if ctx.Err() != nil {
		return results, time.Since(start).Seconds(), fmt.Errorf("test exceeded 10-minute limit")
	}

	return results, time.Since(start).Seconds(), nil
}

func calculateMetrics(results []requestResult, duration float64) TestResults {
	latencies := make([]int64, 0, len(results))
	statusCodes := make(map[string]int)
	successCount, errorCount := 0, 0

	for _, r := range results {
		latencies = append(latencies, r.latencyMs)
		if r.isError {
			errorCount++
		} else {
			successCount++
			statusCodes[fmt.Sprintf("%d", r.statusCode)]++
		}
	}

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	total := len(results)
	return TestResults{
		TotalRequests:   total,
		SuccessCount:    successCount,
		ErrorCount:      errorCount,
		ErrorRate:       float64(errorCount) / float64(total) * 100,
		DurationSeconds: duration,
		Rps:             float64(total) / duration,
		Latency: LatencyStats{
			P50: float64(percentile(latencies, 50)),
			P90: float64(percentile(latencies, 90)),
			P99: float64(percentile(latencies, 99)),
			Min: float64(latencies[0]),
			Max: float64(latencies[len(latencies)-1]),
			Avg: avgLatency(latencies),
		},
		StatusCodes: statusCodes,
	}
}

func percentile(sorted []int64, p int) int64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(float64(len(sorted)-1) * float64(p) / 100.0)
	return sorted[idx]
}

func avgLatency(vals []int64) float64 {
	if len(vals) == 0 {
		return 0
	}
	var sum int64
	for _, v := range vals {
		sum += v
	}
	return float64(sum) / float64(len(vals))
}

func connectMongo(url string) (*mongo.Client, error) {
	for i := 1; ; i++ {
		client, err := mongo.Connect(context.Background(), options.Client().ApplyURI(url))
		if err == nil {
			if pingErr := client.Ping(context.Background(), nil); pingErr == nil {
				log.Printf("MongoDB connected")
				return client, nil
			}
		}
		log.Printf("MongoDB not ready (attempt %d) — retrying in 5s", i)
		time.Sleep(5 * time.Second)
	}
}

func connectRabbit(url string) (*amqp.Connection, error) {
	for i := 1; ; i++ {
		conn, err := amqp.Dial(url)
		if err == nil {
			log.Printf("RabbitMQ connected")
			return conn, nil
		}
		log.Printf("RabbitMQ not ready (attempt %d): %v — retrying in 5s", i, err)
		time.Sleep(5 * time.Second)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
