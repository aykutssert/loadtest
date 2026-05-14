package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Task struct {
	TestID       string `json:"testId"`
	TargetURL    string `json:"targetUrl"`
	RequestCount int    `json:"requestCount"`
	Concurrency  int    `json:"concurrency"`
	Method       string `json:"method"`
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

	conn, err := connectRabbit(rabbitURL)
	if err != nil {
		log.Fatalf("RabbitMQ connection failed: %v", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("Failed to open channel: %v", err)
	}
	defer ch.Close()

	ch.QueueDeclare("loadtest_tasks", true, false, false, false, nil)
	ch.Qos(1, 0, false)

	msgs, err := ch.Consume("loadtest_tasks", "", false, false, false, false, nil)
	if err != nil {
		log.Fatalf("Failed to register consumer: %v", err)
	}

	log.Println("Worker ready — waiting for tasks")

	for msg := range msgs {
		var task Task
		if err := json.Unmarshal(msg.Body, &task); err != nil {
			log.Printf("Failed to parse task: %v", err)
			msg.Nack(false, false)
			continue
		}

		log.Printf("Starting test %s → %s  requests=%d concurrency=%d",
			task.TestID, task.TargetURL, task.RequestCount, task.Concurrency)

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

	client := &http.Client{Timeout: 30 * time.Second}
	results := make([]requestResult, 0, task.RequestCount)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, task.Concurrency)

	start := time.Now()

	for i := 0; i < task.RequestCount; i++ {
		wg.Add(1)
		sem <- struct{}{}

		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			req, err := http.NewRequest(task.Method, task.TargetURL, nil)
			if err != nil {
				mu.Lock()
				results = append(results, requestResult{latencyMs: 0, isError: true})
				mu.Unlock()
				return
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
	for i := 0; i < 12; i++ {
		client, err := mongo.Connect(context.Background(), options.Client().ApplyURI(url))
		if err == nil {
			if pingErr := client.Ping(context.Background(), nil); pingErr == nil {
				return client, nil
			}
		}
		log.Printf("MongoDB not ready, retry %d/12...", i+1)
		time.Sleep(5 * time.Second)
	}
	return nil, fmt.Errorf("cannot connect to MongoDB")
}

func connectRabbit(url string) (*amqp.Connection, error) {
	for i := 0; i < 12; i++ {
		conn, err := amqp.Dial(url)
		if err == nil {
			return conn, nil
		}
		log.Printf("RabbitMQ not ready, retry %d/12...", i+1)
		time.Sleep(5 * time.Second)
	}
	return nil, fmt.Errorf("cannot connect to RabbitMQ")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
