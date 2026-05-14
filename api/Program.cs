using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Driver;
using RabbitMQ.Client;

var pack = new ConventionPack { new CamelCaseElementNameConvention() };
ConventionRegistry.Register("camelCase", pack, _ => true);

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

builder.Services.ConfigureHttpJsonOptions(opts =>
    opts.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);

builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("post-tests", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
    options.RejectionStatusCode = 429;
    options.OnRejected = async (ctx, _) =>
    {
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsync(
            JsonSerializer.Serialize(new { error = "Too many requests. Max 10 tests per minute." }));
    };
});

var mongoUrl = Environment.GetEnvironmentVariable("MONGODB_URL") ?? "mongodb://root:password@localhost:27017/";
builder.Services.AddSingleton(new MongoClient(mongoUrl));

builder.Services.AddSingleton(new ConnectionFactory
{
    HostName = Environment.GetEnvironmentVariable("RABBITMQ_HOST") ?? "localhost",
    Port     = int.Parse(Environment.GetEnvironmentVariable("RABBITMQ_PORT") ?? "5672"),
    UserName = Environment.GetEnvironmentVariable("RABBITMQ_USER") ?? "guest",
    Password = Environment.GetEnvironmentVariable("RABBITMQ_PASS") ?? "guest",
});

var app = builder.Build();
app.UseCors();
app.UseRateLimiter();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapPost("/tests", async (TestRequest req, MongoClient mongo, ConnectionFactory rabbitFactory) =>
{
    if (string.IsNullOrWhiteSpace(req.TargetUrl))
        return Results.BadRequest(new { error = "targetUrl is required" });

    if (req.RequestCount > 5000)
        return Results.BadRequest(new { error = "requestCount cannot exceed 5000" });

    if (req.Concurrency > 200)
        return Results.BadRequest(new { error = "concurrency cannot exceed 200" });

    if (req.TimeoutSeconds is < 1 or > 60)
        return Results.BadRequest(new { error = "timeoutSeconds must be between 1 and 60" });

    var blocked = new[] { "kernelgallery.com", "localhost", "127.0.0.1", "::1" };
    var extraBlocked = (Environment.GetEnvironmentVariable("BLOCKED_HOSTS") ?? "")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    if (blocked.Concat(extraBlocked).Any(b => req.TargetUrl.Contains(b, StringComparison.OrdinalIgnoreCase)))
        return Results.BadRequest(new { error = "This target is not allowed" });

    if (Uri.TryCreate(req.TargetUrl, UriKind.Absolute, out var uri) && IsPrivateIp(uri.Host))
        return Results.BadRequest(new { error = "This target is not allowed" });

    var timeout   = req.TimeoutSeconds > 0 ? req.TimeoutSeconds : 30;
    var testId    = Guid.NewGuid().ToString();
    var col       = mongo.GetDatabase("loadtest").GetCollection<TestRecord>("tests");

    await col.InsertOneAsync(new TestRecord
    {
        Id             = testId,
        TargetUrl      = req.TargetUrl,
        RequestCount   = req.RequestCount > 0 ? req.RequestCount : 100,
        Concurrency    = req.Concurrency > 0 ? req.Concurrency : 10,
        Method         = req.Method ?? "GET",
        RampUpSeconds  = req.RampUpSeconds >= 0 ? req.RampUpSeconds : 0,
        TimeoutSeconds = timeout,
        Headers        = req.Headers ?? new(),
        Body           = req.Body ?? "",
        Status         = "queued",
        CreatedAt      = DateTime.UtcNow,
    });

    try
    {
        using var connection = rabbitFactory.CreateConnection();
        using var channel    = connection.CreateModel();
        channel.QueueDeclare("loadtest_tasks", durable: true, exclusive: false, autoDelete: false);
        var props = channel.CreateBasicProperties();
        props.Persistent = true;
        var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        {
            testId,
            req.TargetUrl,
            requestCount   = req.RequestCount > 0 ? req.RequestCount : 100,
            concurrency    = req.Concurrency > 0 ? req.Concurrency : 10,
            method         = req.Method ?? "GET",
            rampUpSeconds  = req.RampUpSeconds >= 0 ? req.RampUpSeconds : 0,
            timeoutSeconds = timeout,
            headers        = req.Headers ?? new Dictionary<string, string>(),
            body           = req.Body ?? "",
        }));
        channel.BasicPublish("", "loadtest_tasks", props, body);
    }
    catch (Exception ex)
    {
        await col.UpdateOneAsync(
            t => t.Id == testId,
            Builders<TestRecord>.Update.Set(t => t.Status, "failed"));
        return Results.Problem($"RabbitMQ unavailable: {ex.Message}");
    }

    return Results.Accepted($"/tests/{testId}", new { testId, status = "queued" });
}).RequireRateLimiting("post-tests");

app.MapGet("/tests/{id}", async (string id, MongoClient mongo) =>
{
    var col    = mongo.GetDatabase("loadtest").GetCollection<TestRecord>("tests");
    var record = await col.Find(t => t.Id == id).FirstOrDefaultAsync();
    return record is null ? Results.NotFound() : Results.Ok(record);
});

app.MapGet("/tests", async (MongoClient mongo) =>
{
    var col  = mongo.GetDatabase("loadtest").GetCollection<TestRecord>("tests");
    var list = await col.Find(_ => true)
        .SortByDescending(t => t.CreatedAt)
        .Limit(20)
        .ToListAsync();
    return Results.Ok(list);
});

app.Run();

static bool IsPrivateIp(string host)
{
    if (!IPAddress.TryParse(host, out var ip))
        return false;
    var b = ip.MapToIPv4().GetAddressBytes();
    return b[0] == 10
        || b[0] == 127
        || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
        || (b[0] == 192 && b[1] == 168)
        || ip.Equals(IPAddress.IPv6Loopback);
}

record TestRequest(
    string TargetUrl,
    int RequestCount,
    int Concurrency,
    string? Method,
    int RampUpSeconds,
    int TimeoutSeconds,
    Dictionary<string, string>? Headers,
    string? Body);

class TestRecord
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public string Id { get; set; } = "";
    public string TargetUrl { get; set; } = "";
    public int RequestCount { get; set; }
    public int Concurrency { get; set; }
    public string Method { get; set; } = "GET";
    public int RampUpSeconds { get; set; }
    public int TimeoutSeconds { get; set; } = 30;
    public Dictionary<string, string> Headers { get; set; } = new();
    public string Body { get; set; } = "";
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
