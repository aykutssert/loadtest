using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Driver;
using RabbitMQ.Client;
using System.Text;
using System.Text.Json;

// MongoDB: map PascalCase C# props → camelCase BSON fields (matches Go worker output)
var pack = new ConventionPack { new CamelCaseElementNameConvention() };
ConventionRegistry.Register("camelCase", pack, _ => true);

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

builder.Services.ConfigureHttpJsonOptions(opts =>
    opts.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);

var mongoUrl = Environment.GetEnvironmentVariable("MONGODB_URL") ?? "mongodb://root:password@localhost:27017/";
var rabbitUrl = Environment.GetEnvironmentVariable("RABBITMQ_URL") ?? "amqp://guest:guest@localhost:5672/";

builder.Services.AddSingleton(new MongoClient(mongoUrl));

// Retry RabbitMQ connection on startup (services may not be ready immediately)
IConnection rabbitConn = ConnectRabbitMQ(rabbitUrl);
builder.Services.AddSingleton<IConnection>(rabbitConn);

static IConnection ConnectRabbitMQ(string url)
{
    var factory = new ConnectionFactory { Uri = new Uri(url) };
    for (int i = 0; i < 12; i++)
    {
        try { return factory.CreateConnection(); }
        catch { Thread.Sleep(5000); }
    }
    throw new Exception("Cannot connect to RabbitMQ after retries");
}

var app = builder.Build();
app.UseCors();

// POST /tests — validate, enqueue, return 202 + testId
app.MapPost("/tests", async (TestRequest req, MongoClient mongo, IConnection rabbit) =>
{
    if (string.IsNullOrWhiteSpace(req.TargetUrl))
        return Results.BadRequest(new { error = "targetUrl is required" });

    var testId = Guid.NewGuid().ToString();
    var col = mongo.GetDatabase("loadtest").GetCollection<TestRecord>("tests");

    await col.InsertOneAsync(new TestRecord
    {
        Id = testId,
        TargetUrl = req.TargetUrl,
        RequestCount = req.RequestCount > 0 ? req.RequestCount : 100,
        Concurrency = req.Concurrency > 0 ? req.Concurrency : 10,
        Method = req.Method ?? "GET",
        Status = "queued",
        CreatedAt = DateTime.UtcNow,
    });

    using var channel = rabbit.CreateModel();
    channel.QueueDeclare("loadtest_tasks", durable: true, exclusive: false, autoDelete: false);
    var props = channel.CreateBasicProperties();
    props.Persistent = true;
    var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
    {
        testId,
        req.TargetUrl,
        requestCount = req.RequestCount > 0 ? req.RequestCount : 100,
        concurrency = req.Concurrency > 0 ? req.Concurrency : 10,
        method = req.Method ?? "GET",
    }));
    channel.BasicPublish("", "loadtest_tasks", props, body);

    return Results.Accepted($"/tests/{testId}", new { testId, status = "queued" });
});

// GET /tests/{id} — fetch single test by ID
app.MapGet("/tests/{id}", async (string id, MongoClient mongo) =>
{
    var col = mongo.GetDatabase("loadtest").GetCollection<TestRecord>("tests");
    var record = await col.Find(t => t.Id == id).FirstOrDefaultAsync();
    return record is null ? Results.NotFound() : Results.Ok(record);
});

// GET /tests — list 20 most recent tests
app.MapGet("/tests", async (MongoClient mongo) =>
{
    var col = mongo.GetDatabase("loadtest").GetCollection<TestRecord>("tests");
    var list = await col.Find(_ => true)
        .SortByDescending(t => t.CreatedAt)
        .Limit(20)
        .ToListAsync();
    return Results.Ok(list);
});

app.Run();

record TestRequest(string TargetUrl, int RequestCount, int Concurrency, string? Method);

class TestRecord
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public string Id { get; set; } = "";
    public string TargetUrl { get; set; } = "";
    public int RequestCount { get; set; }
    public int Concurrency { get; set; }
    public string Method { get; set; } = "GET";
    public string Status { get; set; } = "queued";
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public TestResults? Results { get; set; }
}

class TestResults
{
    public int TotalRequests { get; set; }
    public int SuccessCount { get; set; }
    public int ErrorCount { get; set; }
    public double ErrorRate { get; set; }
    public double DurationSeconds { get; set; }
    public double Rps { get; set; }
    public LatencyStats Latency { get; set; } = new();
    public Dictionary<string, int> StatusCodes { get; set; } = new();
}

class LatencyStats
{
    public double P50 { get; set; }
    public double P90 { get; set; }
    public double P99 { get; set; }
    public double Min { get; set; }
    public double Max { get; set; }
    public double Avg { get; set; }
}
