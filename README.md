# Background Job & Task Processing System

![CI](https://github.com/anooptechie/Background-Job-System/actions/workflows/ci.yml/badge.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![Node](https://img.shields.io/badge/node-v24-green)
![BullMQ](https://img.shields.io/badge/queue-BullMQ-red)
![Redis](https://img.shields.io/badge/broker-Redis-orange)

> A production-grade background job processing system built with Node.js, BullMQ, and Redis — demonstrating asynchronous task execution, durable queuing, and autonomous background workflows entirely independent of the HTTP request–response cycle.

---

## The Problem This Solves

Most naive background job implementations suffer from three critical flaws:

- **Jobs are lost on crashes** — if the server restarts mid-execution, work disappears silently
- **Duplicate side effects on retries** — emails get sent twice, charges get double-processed
- **Zero visibility into failures** — when jobs fail, there's no audit trail or recovery path

This system solves all three with Redis-backed durability, at-most-once side effect execution via `SET NX`, and a full Dead Letter Queue with replay semantics.

---

## Key Design Decisions

**At-most-once side effects using Redis reservation**
Before executing any side effect, the worker atomically reserves a key using `SET NX`. If the worker crashes after reservation but before completion, the retry detects the reservation and skips re-execution — guaranteeing the side effect runs exactly once across all attempts.

**Time-bucketed idempotency for the scheduler**
The scheduler uses `Math.floor(Date.now() / 60000)` as its idempotency key bucket. Within the same minute, restarts always produce the same job ID — BullMQ silently deduplicates it, making the scheduler restart-safe with no extra infrastructure.

**API boundary validation before queue entry**
Zod schemas validate every payload before it enters Redis. Invalid jobs never reach the queue — preventing wasted worker cycles, DLQ pollution, and corrupted metrics signals.

---

## Architecture

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  API Server │──────▶│ Redis Queue │──────▶│   Worker    │
│  (Producer) │       │  (BullMQ)   │       │ (Consumer)  │
└─────────────┘       └─────────────┘       └─────────────┘
       ▲                                            ▲
       │                                            │
┌─────────────┐                          ┌─────────────────┐
│  Scheduler  │                          │  System Producer │
│  (cron.js)  │                          │ (systemProducer) │
└─────────────┘                          └─────────────────┘
```

Three independent job producers — all feeding the same Redis queue, all processed by the same worker. Producers and consumers are fully decoupled.

### Containerised Topology

```
API Container ──▶ Redis Container ──▶ Worker Container(s)
```

Each component runs in isolation over a shared Docker network. Workers scale independently from the API.

---

## Core Capabilities

| Capability | Description |
|---|---|
| Asynchronous job execution | Jobs run independently of API requests |
| Durable job queuing | Redis-backed persistence — no job loss on crashes |
| Decoupled processes | API and worker are fully independent services |
| Observable lifecycle | Real-time job status tracking via API |
| Idempotent operations | Safe under retries, crashes, and duplicate requests |
| At-most-once side effects | Redis `SET NX` reservation pattern |
| Automatic retries with backoff | 3 attempts, 10s fixed backoff |
| Scheduled jobs | Time-based triggers without external cron infrastructure |
| Multi-queue isolation | Workloads separated to prevent cross-queue interference |
| Dead Letter Queue | Terminal failures isolated, inspectable, and replayable |
| Horizontal scaling | Workers scale independently from the API |
| Priority scheduling | High-priority jobs processed before lower-priority ones |
| Rate limiting | Per-queue intake control under burst traffic |
| Graceful shutdown | Zero partial executions on SIGTERM/SIGINT |

---

## Tech Stack

| Technology | Role |
|---|---|
| **Node.js v24** | JavaScript runtime |
| **Express.js** | API server framework |
| **BullMQ** | Redis-based job queue library |
| **Redis** | Durable message broker and state store |
| **ioredis** | Redis client for Node.js |
| **Zod** | Schema-based payload validation |
| **Pino** | Structured JSON logging |
| **Prometheus** | Metrics exposition format |
| **BullBoard** | Real-time operational dashboard |
| **Jest + Supertest** | Integration testing |
| **Docker + Compose** | Containerised deployment |
| **GitHub Actions** | Continuous integration pipeline |

---

## API Reference

### Submit a Job

```
POST /jobs
```

```json
{
  "type": "welcome-email",
  "idempotencyKey": "user-123-welcome-v1",
  "priority": 1,
  "payload": {
    "email": "anoop@example.com"
  }
}
```

Response — immediate `202 Accepted`, execution is async:
```json
{
  "status": "accepted",
  "jobId": "d25870002bc7...",
  "priority": 1
}
```

### Query Job Status

```
GET /jobs/:id/status
```

```json
{
  "jobId": "d25870002bc7...",
  "type": "welcome-email",
  "state": "completed",
  "createdAt": "2026-05-31T10:12:30.000Z",
  "processedAt": "2026-05-31T10:12:32.000Z",
  "failedReason": null
}
```

### Dead Letter Queue

```
GET  /jobs/dlq              # List all permanently failed jobs
POST /jobs/dlq/:id/replay   # Replay a specific DLQ job
```

### Monitoring

```
GET /metrics                # API process-level metrics  (port 3000)
GET /metrics                # Worker job execution metrics (port 3001)
GET /admin/queues           # BullBoard UI — Basic Auth protected
```

---

## Supported Job Types

| Job Type | Queue | Concurrency | Rate Limit | Simulated Work |
|---|---|---|---|---|
| `welcome-email` | `email-queue` | 3 | 5/sec | 2 seconds |
| `generate-report` | `report-queue` | 2 | 2/sec | 4 seconds |
| `cleanup-temp` | `cleanup-queue` | 1 | 1/sec | 1 second |

Each job type has its own Zod schema enforcing required fields and correct data types. Invalid payloads are rejected at the API boundary before touching Redis.

**Test flags (available on all job types):**
- `forceFail: true` — forces the job to fail on every attempt, triggering retries and DLQ
- `crashAfterSideEffect: true` — crashes after reserving the side effect, proving at-most-once execution on retry

---

## Job Lifecycle

```
waiting → active → completed
                 ↘ failed → retry → ... → DLQ (after max attempts)
```

| State | Description |
|---|---|
| `waiting` | Queued, not yet picked up |
| `active` | Currently being processed |
| `completed` | Finished successfully |
| `failed` | Failed after all retry attempts — moved to DLQ |

---

## Failure Handling

- **Retry strategy:** 3 attempts with 10s fixed backoff
- **DLQ trigger:** Job moves to DLQ only after all retries are exhausted — retrying jobs are never considered dead
- **DLQ replay:** Creates a new job from the original payload; `forceFail` flag stripped automatically; max 3 replays enforced; full lineage preserved via `replayedFromJobId` and `replayCount`
- **Worker isolation:** A failed job never crashes the worker or affects other queues

---

## Idempotency & Safety

**Idempotent job creation:**
- Every submission requires a client-defined `idempotencyKey`
- Duplicate requests with the same key produce the same `jobId` — no duplicate jobs
- Keys are SHA-256 hashed into BullMQ job IDs

**At-most-once side effects:**
```
attempt 1: SET NX "side-effect:{jobId}" → reserved → execute → crash
attempt 2: SET NX "side-effect:{jobId}" → already set → skip → complete_recovered
```
Side effects execute exactly once across all retry attempts, even under mid-execution crashes.

---

## Observability

### Structured Logging (Pino)

Every log entry carries a stable `jobId` for full lifecycle correlation:

```json
{"level":30,"service":"job-processor","jobId":"d258...","msg":"job.started"}
{"level":30,"service":"job-processor","jobId":"d258...","msg":"job.side_effect_started"}
{"level":30,"service":"job-processor","jobId":"d258...","msg":"job.completed"}
```

Recovery path:
```json
{"level":40,"service":"job-processor","jobId":"d258...","msg":"job.side_effect_already_executed"}
{"level":30,"service":"job-processor","jobId":"d258...","msg":"job.completed_recovered"}
```

### Prometheus Metrics

| Metric | Description |
|---|---|
| `jobs_total{status, type}` | Execution counter by outcome and job type |
| `job_duration_ms{type}` | Latency histogram — successful jobs only |
| `dlq_jobs_total{type}` | Terminal failure counter |
| `queue_waiting_jobs{queue}` | Current backlog per queue |
| `queue_active_jobs{queue}` | Jobs in flight per queue |
| `queue_delayed_jobs{queue}` | Jobs pending retry per queue |

Latency histograms intentionally exclude failed executions to prevent skewed performance signals.

---

## Scaling

### Horizontal Scaling

```bash
docker compose up --scale worker=3
```

```
Redis → Worker 1 ─┐
       Worker 2 ─┼─ All consuming the same queue
       Worker 3 ─┘   Redis locking ensures no duplicate execution
```

### Vertical Scaling (Concurrency)

```
Total parallel jobs = workers × concurrency per worker
Example: 3 workers × concurrency 3 = 9 parallel jobs
```

---

## Graceful Shutdown

On `SIGTERM` or `SIGINT`, the worker:

1. Stops accepting new jobs
2. Waits for all active jobs to complete
3. Closes all worker instances
4. Shuts down the metrics server
5. Disconnects from Redis cleanly

No partial job execution. Safe for Docker restarts and zero-downtime deployments.

---

## Getting Started

### Option A — Docker (Recommended)

```bash
git clone https://github.com/anooptechie/Background-Job-System.git
cd Background-Job-System

# Configure environment
cp .env.example .env
# Edit .env — set REDIS_URL, ADMIN_USER, ADMIN_PASSWORD

# Start the full system
docker compose up

# Scale workers (optional)
docker compose up --scale worker=3
```

### Option B — Local Development

```bash
npm install
cp .env.example .env
# Ensure REDIS_URL points to a running Redis instance

# Start Redis
docker run -p 6379:6379 redis

# Start API + Worker concurrently
npm run dev
```

### Run System Producer (no HTTP required)

```bash
REDIS_URL=redis://localhost:6379 node jobs/systemProducer.js
```

### Run Scheduler

```bash
REDIS_URL=redis://localhost:6379 node scheduler/cron.js
```

---

## Continuous Integration

GitHub Actions runs on every push and pull request:

```
Checkout → Build Docker Images → Start Services → Run Integration Tests → Pass/Fail
```

| Test | What it validates |
|---|---|
| Health check | API starts and responds |
| Job submission | Valid jobs accepted with `202` |
| Worker stability | Jobs processed without runtime errors |
| Job lifecycle | `waiting → active → completed` transition |
| Idempotency | Same key always returns same `jobId` |
| Retry handling | Failed jobs retry and reach terminal `failed` state |
| DLQ isolation | Permanently failed jobs isolated correctly |
| DLQ retrieval | `GET /jobs/dlq` returns correct entries |
| DLQ replay | Replayed jobs preserve lineage metadata |

---

## Project Structure

```
.
├── api/
│   ├── app.js                    # Express server, BullBoard, metrics endpoint
│   ├── controllers/
│   │   └── jobController.js      # Job creation, status, DLQ, replay handlers
│   ├── middleware/
│   │   └── rateLimiter.js        # Redis-based per-user rate limiting
│   ├── queue/
│   │   ├── jobQueue.js           # Job enqueue with idempotency hashing
│   │   ├── queueRegistry.js      # Centralized queue definitions
│   │   └── deadLetterQueue.js    # DLQ queue instance
│   ├── routes/
│   │   └── jobRoutes.js          # Route definitions
│   └── validation/
│       └── jobSchemas.js         # Zod schemas per job type
├── worker/
│   └── worker.js                 # Job processor, metrics server, graceful shutdown
├── scheduler/
│   └── cron.js                   # Time-bucketed scheduled job producer
├── jobs/
│   └── systemProducer.js         # HTTP-free internal job producer
├── scripts/
│   ├── inspectDlq.js             # CLI DLQ inspection tool
│   └── replayDlqJob.js           # CLI DLQ replay tool
├── shared/
│   ├── redis.js                  # Shared Redis connection
│   ├── logger.js                 # Pino structured logger
│   └── metrics.js                # Prometheus metric definitions
├── tests/
│   └── job.test.js               # Integration test suite
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions CI pipeline
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── STARTUP.md
└── README.md
```

---

## Configuration

```bash
REDIS_URL=redis://localhost:6379   # Redis connection (use rediss:// for TLS)
ADMIN_USER=<username>              # BullBoard Basic Auth username
ADMIN_PASSWORD=<password>          # BullBoard Basic Auth password
WORKER_METRICS_PORT=3001           # Worker metrics server port (default: 3001)
LOG_LEVEL=info                     # Pino log level (default: info)
```

---

## Learning Outcomes

This project demonstrates:

- Producer–consumer pattern with Redis and BullMQ
- Idempotent API design and safety under retries and crashes
- At-most-once side effect execution using Redis `SET NX` reservation
- Retry, backoff, and dead-letter queue strategies
- Time-bucketed idempotency for stateless schedulers
- Structured observability: Pino logging, Prometheus metrics, BullBoard dashboard
- Multi-queue workload isolation and per-queue concurrency/rate limiting
- Priority-based job scheduling
- Graceful shutdown for safe distributed deployments
- Containerisation with Docker and multi-service orchestration
- Black-box integration testing in a GitHub Actions CI pipeline

---

*Built to demonstrate production-grade background job processing — from a simple async queue to an observable, containerised, CI-validated distributed platform.*