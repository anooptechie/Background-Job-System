# Background Job & Task Processing System

> A production-grade background job processing system demonstrating asynchronous task execution, durable queuing, and autonomous background workflows — built to operate entirely independently of the HTTP request–response cycle.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Job Lifecycle](#job-lifecycle)
- [API Reference](#api-reference)
- [Failure Handling & Retries](#failure-handling--retries)
- [Idempotency & Safety](#idempotency--safety)
- [Job Types](#job-types)
- [Scaling](#scaling)
- [Multi-Queue Workload Isolation](#multi-queue-workload-isolation)
- [Rate Limiting](#rate-limiting)
- [Graceful Shutdown](#graceful-shutdown)
- [Observability](#observability)
- [Dead Letter Queue (DLQ)](#dead-letter-queue-dlq)
- [Operational Dashboard](#operational-dashboard)
- [Payload Validation](#payload-validation)
- [Dockerised Deployment](#dockerised-deployment)
- [Continuous Integration](#continuous-integration)
- [Configuration](#configuration)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Learning Outcomes](#learning-outcomes)

---

## Overview

This system showcases how to build reliable background processing infrastructure that goes far beyond a single request–response API. It supports API-triggered jobs, system-initiated jobs, and scheduled recurring jobs — all with idempotency, retry safety, observability, and at-most-once side effect guarantees.

**Core capabilities:**

| Capability | Description |
|---|---|
| Asynchronous job execution | Jobs run independently of API requests |
| Durable job queuing | Redis-backed persistence ensures no job loss |
| Decoupled processes | API and worker are fully independent |
| Observable lifecycle | Real-time job status tracking via API |
| Idempotent operations | Safe under retries, crashes, and duplicate requests |
| Automatic retries with backoff | Configurable retry strategy per job |
| Scheduled jobs | Time-based triggers without external cron |
| Multi-queue isolation | Workloads separated to prevent cross-queue interference |
| Dead Letter Queue | Terminal failures isolated and inspectable |
| Horizontal scaling | Workers scale independently from the API |

---

## Tech Stack

| Technology | Role |
|---|---|
| **Node.js** | JavaScript runtime |
| **Express.js** | API server framework |
| **BullMQ** | Redis-based job queue library |
| **Redis** | Durable message broker and state store |
| **ioredis** | Redis client for Node.js |
| **Zod** | Schema-based payload validation |
| **Prometheus** | Metrics exposition format |
| **BullBoard** | Real-time operational dashboard |
| **Jest + Supertest** | Integration testing |
| **Docker + Compose** | Containerised deployment |
| **GitHub Actions** | Continuous integration pipeline |
| **dotenv** | Environment variable management |
| **nodemon / concurrently** | Development workflow tooling |

---

## Architecture

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  API Server │──────▶│ Redis Queue │──────▶│   Worker    │
│  (Producer) │       │  (BullMQ)   │       │ (Consumer)  │
└─────────────┘       └─────────────┘       └─────────────┘
```

The system is composed of three independent components:

- **API Server** — Accepts job submissions, validates payloads, and enqueues jobs. Acts as the system boundary; only valid domain objects enter the queue.
- **Redis Queue** — Serves as the durable intermediary between producers and consumers. Manages job state, retry scheduling, and locking.
- **Worker Process** — Consumes jobs from the queue and executes them asynchronously. Fully decoupled from the API lifecycle.

API availability and worker availability are independent, which enables:

- Independent scaling of producers and consumers
- Fault isolation between components
- Zero-downtime deployments

### Containerised Topology (Phase 16+)

```
API Container
     │
     ▼
Redis Container
     │
     ▼
Worker Container(s)
```

Each component runs in isolation and communicates over a shared Docker network.

---

## Job Lifecycle

Each job has a well-defined, observable lifecycle managed by BullMQ and stored in Redis.

| State | Description |
|---|---|
| `waiting` | Job is queued but not yet being processed |
| `active` | Job is currently being processed by a worker |
| `completed` | Job finished successfully |
| `failed` | Job execution failed after all retry attempts |

> **Note:** Jobs remain in the `waiting` state when no workers are running. This is intentional and correct — it demonstrates that job creation and job execution are fully decoupled.

---

## API Reference

### Submit a Job

```
POST /jobs
```

**Request body:**

```json
{
  "type": "welcome-email",
  "idempotencyKey": "user-123-welcome-v1",
  "payload": {
    "email": "albert@example.com",
    "name": "Albert",
    "message": "Congratulations! Your background job system is live."
  }
}
```

**Response:**

```json
{
  "status": "accepted",
  "jobId": "15"
}
```

The API responds immediately with `202 Accepted`. Job execution happens asynchronously.

---

### Query Job Status

```
GET /jobs/:id/status
```

**Response:**

```json
{
  "jobId": "15",
  "type": "welcome-email",
  "state": "waiting",
  "createdAt": "2026-01-18T10:12:30.000Z",
  "processedAt": null,
  "failedReason": null
}
```

---

### Dead Letter Queue

```
GET /jobs/dlq
```

Returns all permanently failed jobs with their full failure context.

```
POST /jobs/dlq/:id/replay
```

Replays a specific DLQ job. Creates a new job and preserves lineage metadata.

---

### Metrics

```
GET /metrics          # API and process-level metrics
GET /metrics          # Worker job execution metrics (separate port)
```

---

### Operational Dashboard

```
GET /admin/queues     # BullBoard UI (protected by Basic Auth)
```

---

## Failure Handling & Retries

The system is designed to handle failures gracefully without crashing workers or blocking other jobs.

### Failure Model

- Job failures are signaled by throwing errors inside the worker
- A failed job does not crash the worker or affect other jobs in the queue
- Failure reasons, attempt counts, and timestamps are recorded and exposed via the status API

### Retry Strategy

- Retries are configured at job creation time
- A fixed maximum number of retry attempts is enforced
- Retry execution is managed entirely by BullMQ — workers are not responsible for retry logic

### Backoff Policy

- A fixed backoff delay is applied between retries
- This prevents retry storms and reduces pressure on external dependencies

### Dead-Letter Behavior

- After all retry attempts are exhausted, the job transitions to terminal `failed` state
- Failed jobs are automatically moved to the Dead Letter Queue (DLQ)
- Workers continue processing other jobs without interruption

---

## Idempotency & Safety

The system guarantees safe background job processing under retries, crashes, and duplicate requests.

### Idempotent Job Creation

- Clients **must** provide an `idempotencyKey` with every job submission
- Duplicate requests with the same key result in a single job — no duplicates are created
- Idempotency keys are hashed to generate Redis/BullMQ-safe job IDs
- Internal job IDs are never reused as client idempotency keys

### At-Most-Once Side Effects

- Side effects are protected using a Redis reservation pattern (`SET NX`)
- Side effects execute **at most once**, even if a worker crashes mid-execution
- Retries stop as soon as a job successfully completes

### Design Principle

> **Idempotency expresses intent.**  
> **Job IDs enforce safety.**  
> **Side effects must be protected before execution.**

---

## Job Types

The system supports three modes of job creation:

### 1. API-Triggered Jobs

Created via `POST /jobs`. The standard flow for user-initiated or application-initiated work.

### 2. System-Triggered Jobs

A standalone Node.js producer script enqueues jobs directly — without any HTTP call. It reuses the same queue, Redis connection, and idempotency logic. Workers remain unchanged.

This proves that job producers are not tied to HTTP and can exist independently.

### 3. Scheduled Jobs

A lightweight scheduler using `setInterval` runs as a separate process and enqueues jobs at fixed time intervals. No external cron or infrastructure is required.

**Safety rules for scheduled jobs:**
- Jobs use **time-bucketed idempotency keys** — the same time window always produces the same job ID, preventing duplicates
- The scheduler is stateless and restart-safe
- Retry and side-effect safety guarantees remain fully enforced

---

## Scaling

### Horizontal Scaling

Multiple worker processes can run simultaneously, all consuming from the same queue:

```
API → Redis → Worker 1
               Worker 2
               Worker 3
```

Each worker competes for jobs independently. Redis-based locking ensures safe distributed execution — each job attempt is processed by exactly one worker.

### Per-Worker Concurrency

Workers support configurable concurrency, allowing a single worker to process multiple jobs in parallel:

```
Total parallel jobs = number of workers × concurrency per worker
```

For example: 3 workers × concurrency 3 = **9 parallel jobs**

---

## Multi-Queue Workload Isolation

All jobs share no queue by default. Workloads are segmented into independent queues to prevent cross-workload interference.

| Queue | Job Type | Concurrency |
|---|---|---|
| `email-queue` | `welcome-email` | 3 |
| `report-queue` | `generate-report` | 2 |
| `cleanup-queue` | `cleanup-temp` | 1 |

Each queue has independent FIFO ordering, independent concurrency limits, and is processed by its own Worker instance.

**Isolation guarantees:**
- Heavy report jobs cannot delay email notifications
- Retry storms in one queue do not affect others
- DLQ behavior is correct and scoped per job type

---

## Rate Limiting

Per-queue rate limits control how fast jobs begin execution, protecting downstream services from overload.

| Queue | Concurrency | Rate Limit |
|---|---|---|
| `email-queue` | 3 | 5 jobs/sec |
| `report-queue` | 2 | 2 jobs/sec |
| `cleanup-queue` | 1 | 1 job/sec |

Rate limiting applies independently per queue, ensuring email processing is never affected by a burst of report jobs.

---

## Graceful Shutdown

The worker listens for `SIGTERM` (container shutdown) and `SIGINT` (Ctrl+C). On receiving either signal, it:

1. Stops fetching new jobs
2. Waits for all active jobs to complete
3. Closes all worker instances
4. Shuts down the metrics server
5. Disconnects from Redis
6. Exits cleanly

No partial job execution occurs. This enables safe Docker restarts, Kubernetes rolling deployments, and zero-downtime worker upgrades.

---

## Observability

### Structured Logging

Worker logs are structured and machine-readable. Every log entry is correlated by a stable `jobId`, enabling full lifecycle tracing across retries, failures, and recovery paths.

Logged events include:

- `job.started`
- `job.side_effect_started`
- `job.completed`
- `job.completed_recovered`
- `job.failed`

### Prometheus Metrics

The system emits Prometheus-compatible metrics, labeled by job type.

**Execution counters:**
- Successful job executions
- Failed execution attempts (including retries)
- DLQ entries (`dlq_jobs_total`)

**Latency histograms:**
- Execution duration for successful jobs only (bucketed to expose distribution, not just averages)
- Failed executions are intentionally excluded to prevent skewed performance signals

**Queue depth metrics (polled every 5 seconds):**
- `queue_waiting_jobs{queue="..."}` — current backlog
- `queue_active_jobs{queue="..."}` — jobs in flight
- `queue_delayed_jobs{queue="..."}` — jobs pending retry

Each process exposes its own `/metrics` endpoint, reflecting real-world distributed systems where workers scale independently.

**Design principle:** Metrics are read-only signals. Metrics failures never impact job execution.

---

## Dead Letter Queue (DLQ)

The DLQ isolates permanently failed jobs without affecting normal job execution.

### When a Job Enters the DLQ

A job is moved to the DLQ only when all retry attempts are exhausted and it reaches a terminal failure state. Retrying jobs are never considered dead.

### DLQ Behavior

- The DLQ is a separate BullMQ queue with no attached worker
- Jobs enter the DLQ exactly once
- DLQ jobs are inert — they do not trigger side effects
- Each DLQ entry preserves: original job ID, job type, payload, failure reason, attempt count, and failure timestamp

### DLQ Replay

Replay creates a **new job** from the original payload — it does not resurrect the failed job. Lineage metadata is attached:

- `replayedFromJobId`
- `replayedAt`
- `replayCount`

**Safety guarantees:**
- Replay always generates a new job ID
- Replay does not bypass retries or side-effect protection
- Replay never modifies or deletes the original DLQ entry
- Replay count is tracked and limited to prevent infinite loops
- Failure-inducing payload flags (e.g. `forceFail`) are stripped on replay

If a replayed job fails again, it follows normal retry behavior and enters the DLQ as a new entry. All replay attempts are fully auditable.

---

## Operational Dashboard

BullBoard provides a visual management layer for real-time queue inspection and recovery.

**URL:** `http://localhost:3000/admin/queues`  
**Auth:** Protected by Basic Authentication (credentials via environment variables)

**Capabilities:**

- View job payloads and state transitions
- Inspect failure reasons and stack traces
- Retry failed jobs manually
- Delete problematic jobs
- Clean completed/failed job sets
- Monitor DLQ entries

Because BullBoard connects directly to Redis, it provides cluster-wide visibility across all workers regardless of deployment topology.

---

## Payload Validation

The API boundary is formally hardened using **Zod schema validation**. Validation occurs before any job is enqueued — only valid domain objects enter Redis.

Each job type has a dedicated schema enforcing:
- Required fields per job type
- Correct data types
- Email format validation
- Optional test flags (e.g. `forceFail`)

**Invalid request:**
```json
{ "type": "welcome-email", "payload": {} }
→ 400 Bad Request
```

**Valid request:**
```json
{
  "type": "welcome-email",
  "idempotencyKey": "user-123",
  "payload": { "email": "user@example.com" }
}
→ 202 Accepted
```

Without this boundary enforcement, invalid jobs would consume Redis memory, waste worker CPU cycles, pollute the DLQ with user errors, and corrupt metrics signals.

---

## Dockerised Deployment

The entire system runs with a single command:

```bash
docker compose up
```

### System Topology

```
API Container → Redis Container → Worker Container(s)
```

Each service runs in isolation and communicates over a Docker network. Redis is available at `redis://redis:6379` within the network.

### Horizontal Worker Scaling

```bash
docker compose up --scale worker=3
```

This enables parallel job processing, load distribution across workers, and realistic simulation of distributed system behavior.

---

## Continuous Integration

A GitHub Actions CI pipeline automatically validates the system on every push and pull request.

### CI Workflow

```
Checkout → Build Docker Images → Start Services → Run Integration Tests → Pass / Fail
```

### What CI Validates

| Check | Description |
|---|---|
| System startup | Docker containers build and services start without errors |
| API availability | Health endpoint responds successfully |
| Job submission | Valid jobs are accepted (`202 Accepted`) |
| Worker stability | Jobs are processed without runtime failures |
| Job lifecycle | Jobs transition `waiting → active → completed` |
| Idempotency | Duplicate requests with same key return the same job ID |
| Retry handling | Failed jobs are retried and reach terminal `failed` state |
| DLQ isolation | Permanently failed jobs are isolated in the DLQ |
| DLQ retrieval | DLQ jobs are accessible via `GET /jobs/dlq` |
| DLQ replay | Jobs can be replayed with lineage metadata preserved |

Tests follow a **black-box integration testing** model — they interact only via API endpoints and do not depend on internal implementation details. This ensures stability during refactoring and validates real-world system guarantees.

## 🚀 Post-CI Enhancements

After establishing a stable CI pipeline, the system was extended with the following production-grade capabilities:

### 🔍 DLQ Observability
- Exposed `GET /jobs/dlq` endpoint
- Enabled inspection of failed jobs and failure metadata

### ♻️ DLQ Replay Mechanism
- Added `POST /jobs/dlq/:id/replay`
- Implemented safeguards:
  - replay limit (max 3 attempts)
  - payload sanitization (removes failure triggers)
  - replay tracking (`replayCount`, `replayedFromJobId`)

### 🧵 Concurrency Control
- Configured per-queue concurrency limits
- Prevented worker overload by controlling parallel execution

### ⚡ Rate Limiting
- Applied queue-level rate limiting using BullMQ limiter
- Controlled job intake under burst traffic conditions

### 🧪 Load Testing & Validation
- Simulated burst traffic using parallel requests
- Verified:
  - concurrency behavior
  - rate limiting behavior

### 🎯 Priority Scheduling
- Introduced priority-based job execution
- Ensured high-priority jobs are processed before lower-priority ones
- Verified behavior under load

### 🔎 Observability Improvements
- Enhanced logging with:
  - job priority
  - execution tags (HIGH / LOW)
- Improved traceability of job execution order

---

## Configuration

All infrastructure configuration is externalized via environment variables.

### Environment Variables

```bash
# Redis
REDIS_URL=redis://localhost:6379

# Admin Dashboard
ADMIN_USER=<username>
ADMIN_PASSWORD=<password>
```

During local development, values are stored in a `.env` file and loaded by `dotenv`. No credentials are hardcoded or committed to version control.

Copy `.env.example` to `.env` and fill in your values before starting.

---

## Getting Started

### Option A — Docker (Recommended)

```bash
# Clone the repository
git clone <repo-url>
cd <repo-name>

# Configure environment
cp .env.example .env
# Edit .env with your values

# Start the full system
docker compose up

# Scale workers (optional)
docker compose up --scale worker=3
```

### Option B — Local Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — ensure REDIS_URL points to a running Redis instance

# Start Redis (if running locally)
# e.g. redis-server or via Docker: docker run -p 6379:6379 redis

# Start API + Worker + Scheduler concurrently
npm run dev
```

**Testing with Postman:** During development, Postman is the recommended client for simulating job submissions and inspecting responses.

See `STARTUP.md` for full setup details.

---

## Project Structure

```
.
├── src/
│   ├── api/              # Express API server (producer)
│   │   └── jobSchemas.js # Zod validation schemas
│   ├── worker/           # Job consumer / processor
│   ├── scheduler/        # Scheduled job producer
│   └── queue/            # BullMQ queue configuration & registry
├── .github/
│   └── workflows/
│       └── ci.yml        # GitHub Actions CI pipeline
├── Dockerfile            # Node.js application container
├── docker-compose.yml    # Multi-service orchestration
├── .dockerignore
├── .env.example          # Environment variable template
├── PROJECT_CONTEXT.md    # Architectural decisions and history
├── README.md             # This file
└── STARTUP.md            # Detailed setup instructions
```

---

## Learning Outcomes

This project demonstrates:

- How to build reliable, decoupled asynchronous systems
- Producer–consumer pattern implementation with Redis and BullMQ
- Idempotent API design and safety under retries
- Retry, backoff, and dead-letter queue strategies
- At-most-once side effect execution using Redis reservation
- Structured observability: logging, metrics, and dashboards
- Multi-queue workload isolation and per-queue rate limiting
- Graceful shutdown for safe distributed deployments
- Containerisation with Docker and multi-service orchestration
- Black-box integration testing in a CI pipeline
- Clean architecture with strict separation of producers, consumers, and infrastructure

---

## License

This project is intended for educational and demonstration purposes.

---

## Contributing

This is a learning project. Feel free to fork and experiment with different job types, queue configurations, scaling strategies, and observability tooling.

---

*Built to demonstrate production-grade background job processing — from a simple async queue all the way to an observable, containerised, CI-validated distributed platform.*