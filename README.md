# LoadTest Engine

A self-hosted, asynchronous distributed load testing platform built with an event-driven microservice architecture.

Live demo: [loadtest.kernelgallery.com](https://loadtest.kernelgallery.com)

---

## What It Does

Send HTTP load to any target URL with configurable concurrency and request count. Results stream back in real time — latency percentiles (P50 / P90 / P99), throughput (RPS), status code distribution, and error rates.

---

## Architecture

```
Client (React) → C# API → RabbitMQ → Go Worker → Target Server
                    ↓                      ↓
                 MongoDB ←────────── Save Metrics
                    ↑
              Poll Results
```

| Step | Component | Role |
|------|-----------|------|
| 1 | **React Frontend** | Configure test parameters, display live results |
| 2 | **C# .NET 8 API** | Validate input, enqueue task, return test ID (HTTP 202) |
| 3 | **RabbitMQ** | Async message queue — decouples API from worker |
| 4 | **Go Worker** | Consume task, fire concurrent HTTP requests via goroutines |
| 5 | **MongoDB** | Persist test results and performance metrics |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | C# .NET 8 Minimal API |
| Worker | Go 1.22 (goroutines, `net/http`) |
| Message Queue | RabbitMQ 3 |
| Database | MongoDB 7 |
| Frontend | React 18 + Vite + Tailwind CSS |
| Reverse Proxy | Traefik (via Coolify) |
| Deployment | Coolify on Contabo VPS (6 vCPU / 12 GB RAM) |
| CDN / DNS | Cloudflare |

---

## Metrics Collected

- **Latency:** P50, P90, P99 (milliseconds)
- **Throughput:** Requests per second (RPS)
- **Status Codes:** Distribution across all responses
- **Error Rate:** Percentage of failed requests
- **Timestamps:** Start / end / duration

---

## AWS Equivalents

| Component | This Project | AWS Equivalent |
|-----------|-------------|----------------|
| Message Queue | RabbitMQ | SQS / Amazon MQ |
| Database | MongoDB | DynamoDB |
| API Runtime | .NET 8 on VPS | ECS Fargate / Lambda |
| Worker Runtime | Go on VPS | ECS Fargate |
| Load Balancer | Traefik | Application Load Balancer |
| DNS / CDN | Cloudflare | Route 53 + CloudFront |

---

## Project Structure

```
loadtest/
├── api/          # C# .NET 8 Minimal API
├── worker/       # Go worker service
├── frontend/     # React + Vite + Tailwind
└── infra/        # Docker Compose, deployment configs
```
