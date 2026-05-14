# Surge

Self-hosted distributed load testing engine. Send HTTP load to any target, get P50/P90/P99 latency, RPS, status code distribution, and error rate back in real time.

**Live:** [loadtest.kernelgallery.com](https://loadtest.kernelgallery.com)

---

## Architecture

```
React → C# API → RabbitMQ → Go Worker → Target
              ↓                    ↓
           MongoDB ←───── persist results
              ↑
         poll (2s)
```

| Service | Role |
|---------|------|
| C# .NET 8 API | Validates input, enqueues task, returns test ID (HTTP 202) |
| Go Worker | Consumes task, fires concurrent HTTP requests via goroutines |
| RabbitMQ | Async queue — decouples API from worker |
| MongoDB | Persists test records and metrics |
| React + Vite | Configures tests, polls and displays results |

---

## Self-hosting with Coolify

Deploy each service (`api`, `worker`, `frontend`) as a separate Coolify application from this repo. All services must share the same Docker network.

### API

| Setting | Value |
|---------|-------|
| Base Dir | `/api` |
| Dockerfile | `Dockerfile` |
| Port | `8080` |

Environment variables:

```
ASPNETCORE_URLS=http://+:8080
RABBITMQ_HOST=<rabbitmq-hostname>
RABBITMQ_PORT=5672
RABBITMQ_USER=<user>
RABBITMQ_PASS=<pass>
MONGODB_URL=mongodb://<user>:<pass>@<host>:27017/
```

### Worker

| Setting | Value |
|---------|-------|
| Base Dir | `/worker` |
| Dockerfile | `Dockerfile` |
| Port | *(none)* |

Environment variables:

```
RABBITMQ_HOST=<rabbitmq-hostname>
RABBITMQ_PORT=5672
RABBITMQ_USER=<user>
RABBITMQ_PASS=<pass>
MONGODB_URL=mongodb://<user>:<pass>@<host>:27017/
```

### Frontend

| Setting | Value |
|---------|-------|
| Base Dir | `/frontend` |
| Dockerfile | `Dockerfile` |
| Port | `80` |

Set the API base URL in [`frontend/src/api.js`](frontend/src/api.js) before building:

```js
export const API = 'https://your-api-domain.com'
```

---

## Local dev with Docker Compose

```bash
docker compose up --build
```

- API → `http://localhost:8080`
- Frontend → `http://localhost:3000`

---

## Limits

- Max 5 000 requests per test
- Max 200 concurrent goroutines
- Localhost and private IPs are blocked

---

## Stack

C# .NET 8 · Go 1.22 · RabbitMQ 3 · MongoDB 7 · React 18 · Vite · Tailwind CSS
