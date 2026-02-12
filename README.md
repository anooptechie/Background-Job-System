# Background Job & Task Processing System

A production-grade background job processing system demonstrating asynchronous task execution, durable queuing, and autonomous background workflows.

This project showcases how to build reliable background processing systems that operate independently of HTTP request–response cycles, with support for API-triggered, system-initiated, and scheduled jobs.

---

## 🎯 Core Capabilities

- **Asynchronous job execution** – Jobs run independently of API requests
- **Durable job queuing** – Redis-backed persistence ensures no job loss
- **Independent processes** – API and worker processes are fully decoupled
- **Observable lifecycle** – Real-time job status tracking via API
- **Idempotent operations** – Safe under retries, crashes, and duplicate requests
- **Retry mechanism** – Automatic retry with backoff for failed jobs
- **Scheduled jobs** – Time-based job triggering without external cron
- **Clean architecture** – Clear separation of producers and consumers

---

## 🛠️ Tech Stack

- **Node.js** – JavaScript runtime
- **Express.js** – API server framework
- **BullMQ** – Redis-based job queue library
- **Redis** – Durable message broker and state store
- **ioredis** – Redis client for Node.js
- **dotenv** – Environment variable management
- **nodemon** – Development hot-reloading
- **concurrently** – Multi-process development orchestration

---

## 🏗️ Architecture Overview

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  API Server │──────▶│Redis Queue  │──────▶│   Worker    │
│  (Producer) │       │  (BullMQ)   │       │ (Consumer)  │
└─────────────┘       └─────────────┘       └─────────────┘
```

### Components

- **API Server** – Acts as a job producer, accepts job requests and enqueues them
- **Redis Queue** – Serves as a durable intermediary between API and workers
- **Worker Process** – Consumes jobs from the queue and executes them asynchronously

API availability and worker availability are fully decoupled, enabling:

- Independent scaling of producers and consumers
- Fault isolation
- Zero-downtime deployments

---

## 📤 Job Submission

Jobs are submitted via `POST /jobs` as structured JSON payloads.

### Example Request

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

### Example Response

```json
{
  "status": "accepted",
  "jobId": "15"
}
```

**Note:** The API responds immediately. Job execution happens asynchronously.

### Development Testing

During development, **Postman** is used as the primary client to simulate real application requests.

---

## 📊 Job Lifecycle & Status Tracking

Each job has an observable lifecycle managed by BullMQ.

### Job States

| State       | Description                                   |
| ----------- | --------------------------------------------- |
| `waiting`   | Job is queued but not yet being processed     |
| `active`    | Job is currently being processed by a worker  |
| `completed` | Job finished successfully                     |
| `failed`    | Job execution failed after all retry attempts |

**Note:** Jobs can remain in the `waiting` state when no workers are running. This is intentional and correct.

### Job Status API

Query job status using:

```
GET /jobs/:id/status
```

#### Example Response

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

This confirms that job creation and job execution are fully decoupled.

---

## 🔄 Failure Handling, Retries & Backoff

The system is designed to handle failures gracefully without crashing workers or blocking other jobs.

### Failure Handling

- Job execution errors are thrown inside the worker
- Failed jobs do not crash the worker process
- Failure reasons are recorded and exposed via the status API

### Automatic Retries

- Jobs are retried automatically when execution fails
- Retry behavior is configured at job creation time
- Retries are limited to a fixed number of attempts

### Backoff Strategy

- A fixed delay is applied between retries
- This prevents retry storms and reduces pressure on external dependencies

### Dead-Letter Behavior

- After all retry attempts are exhausted, jobs stop retrying
- Failed jobs remain stored in Redis and are fully inspectable
- Workers continue processing other jobs without interruption

This approach ensures resilience while keeping the worker logic simple and predictable.

---

## 🔒 Idempotency & Safety

The system guarantees safe background job processing under retries, crashes, and duplicate requests.

### Idempotent Job Creation

- Clients **must** provide an `idempotencyKey` for every job
- Duplicate requests with the same key result in a single job
- Idempotency keys are hashed to generate Redis/BullMQ-safe job IDs
- Internal job IDs are never reused as client idempotency keys

### Retry-Safe Side Effects

- Side effects are protected using a Redis reservation pattern (`SET NX`)
- Side effects execute **at most once**, even if a worker crashes
- Retries stop as soon as a job successfully completes
- Failed jobs are retried up to a fixed limit and then dead-lettered

### Observability Guarantees

Job states (`waiting`, `active`, `completed`, `failed`) accurately reflect execution. Worker logs distinguish between:

- Normal success
- Recovery success after retries

### Design Principle

> **Idempotency expresses intent.**  
> **Job IDs enforce safety.**  
> **Side effects must be protected before execution.**

---

## ⏰ Background-Only & Scheduled Jobs

The system supports three types of job creation:

1. **API-triggered jobs** – Created via HTTP POST requests
2. **System-triggered jobs** – Created programmatically by internal scripts
3. **Scheduled jobs** – Created automatically on a time-based schedule

### System-Initiated Jobs (No HTTP Required)

- Introduced a **system producer** that enqueues jobs without any API call
- Jobs are created by running a Node.js script
- Reuses the same queue, Redis connection, and idempotency logic
- Worker remains unchanged

This proves that job producers are not tied to HTTP and can exist independently.

### Scheduled Jobs (Cron-like)

- Added a lightweight scheduler using `setInterval`
- Scheduler runs as a separate process
- Jobs are triggered on a fixed time interval
- No external cron or infrastructure required

### Safety Rules for Scheduled Jobs

To prevent duplication and unsafe execution:

- Scheduled jobs use **time-bucketed idempotency keys**
- Same time window → same job → no duplicates
- Scheduler is stateless and restart-safe
- Worker retries and side-effect safety remain enforced

### Key Outcome

All job types benefit from:

- Idempotent job creation
- Retry-safe execution
- At-most-once side effects
- Redis as the source of truth

This completes the transition from request-response background work to autonomous backend processing.

Observability & Monitoring (Phase 6)

The system includes built-in observability to make asynchronous job execution transparent, debuggable, and production-aligned.

Observability is implemented without altering job execution semantics or failure behavior.

Structured Logging

Worker logs are structured and machine-readable

Every job-related log includes a stable jobId

Logs represent job lifecycle events, not HTTP request flows

Enables tracing a job across retries, failures, and recovery paths

Example events include:

job.started

job.side_effect_started

job.completed

job.completed_recovered

job.failed

Metrics

The worker emits Prometheus-compatible metrics for job execution.

Job Metrics

Execution counters

Successful job executions

Failed execution attempts (including retries)

Latency histograms

Execution duration for successful jobs only

Bucketed to expose performance distribution

Metrics are labeled by job type to support per-job analysis.

Metrics Endpoints
Process Endpoint Description
API /metrics API and process-level metrics
Worker /metrics (separate port) Job execution metrics

Each process exposes its own metrics endpoint, reflecting real-world distributed systems where workers scale independently.

Observability Design Principles

Metrics are read-only signals

Metrics failures never impact job execution

Logs explain what happened

Metrics explain how often and how long

This separation ensures observability does not interfere with correctness.

☠️ Dead Letter Queue (DLQ) (Phase 7)

The system includes an explicit Dead Letter Queue (DLQ) to handle terminal job failures safely and transparently.

The DLQ isolates permanently failed jobs without affecting normal job execution.

When a Job Enters the DLQ

A job is moved to the DLQ only when:

All retry attempts are exhausted

The job reaches a terminal failure state

Retrying jobs are not considered dead and never enter the DLQ.

DLQ Behavior

DLQ is a separate BullMQ queue

No worker consumes DLQ jobs

Jobs enter the DLQ exactly once

DLQ jobs are inert and do not trigger side effects

This ensures failure isolation and prevents cascading errors.

DLQ Contents

Each DLQ entry includes:

Original job ID

Job type

Job payload

Failure reason

Number of attempts

Failure timestamp

This makes DLQ jobs inspectable and replay-ready.

DLQ Metrics

The worker exposes a dedicated DLQ metric:

dlq_jobs_total

Counts permanently failed jobs

Labeled by job type

This metric complements retry-level failure metrics and provides clear operational visibility.

Why This Matters

Explicit DLQs allow the system to:

Distinguish between recoverable and unrecoverable failures

Preserve failure context for inspection

Scale safely without hiding broken jobs

Support future replay and alerting workflows

🔁 DLQ Replay Semantics (Phase 8)

The system supports explicit replay of Dead Letter Queue (DLQ) jobs to allow safe recovery from terminal failures.

Replay is intentionally manual and controlled.

What Replay Means

Replay does not resurrect failed jobs.

Instead, replay:

Creates a new job

Uses the original job payload

Preserves lineage metadata

Executes under normal retry and idempotency rules

This avoids hidden state reuse and preserves correctness.

How Replay Works

A DLQ entry is inspected

A specific DLQ Job ID is selected

A new job is enqueued into the main job queue

Lineage metadata is attached:

replayedFromJobId

replayedAt

The original DLQ entry remains unchanged.

Replay Safety Guarantees

Replay always generates a new job ID

Replay does not bypass retries or side-effect protection

Replay does not delete or modify DLQ records

Replay never occurs automatically

Each replay is an explicit operational decision.

Failure During Replay

If a replayed job fails again:

It follows normal retry behavior

On terminal failure, it enters the DLQ as a new DLQ entry

Previous DLQ entries remain intact

This ensures replay attempts are fully auditable.

Why This Matters

Explicit replay semantics allow the system to:

Recover safely from permanent failures

Preserve historical failure context

Avoid retry storms or hidden loops

Support operational workflows used in real systems

Replay completes the failure lifecycle without sacrificing correctness.

Horizontal Scaling & Worker Concurrency (Phase 9)

The system supports both horizontal and vertical scaling.

Horizontal Scaling

Multiple worker processes can run simultaneously, all consuming from the same queue.

Example:

API
Worker 1
Worker 2
Worker 3


Each worker:

Competes for jobs

Processes different jobs

May handle retries from other workers

Maintains exclusive execution per job attempt

Redis-based locking ensures safe distributed processing.

Per-Worker Concurrency

Workers support configurable concurrency:

{
  connection,
  concurrency: 3
}


This allows a single worker to process multiple jobs in parallel.

Scaling formula:

Total parallel jobs =
Number of workers × concurrency


Example:

3 workers × concurrency 3 = 9 parallel jobs

Observability in a Distributed Setup

Each worker exposes a metrics endpoint:

http://localhost:3001/metrics
http://localhost:3002/metrics
http://localhost:3003/metrics


Metrics are process-local and intended for external aggregation tools such as Prometheus.

Retry Behavior Under Scale

Retries are not bound to a specific worker.

A failed job attempt:

Is released back to the queue

May be retried by any available worker

Remains protected by distributed locking

This ensures fairness and resilience.

Why This Matters

Phase 9 validates that the system:

Scales safely under concurrent load

Maintains idempotency guarantees

Preserves failure isolation

Increases throughput predictably

The project now behaves as a distributed job processing system rather than a single-instance background worker.


🔀 Multi-Queue Workload Isolation (Phase 10)

The system now supports multiple isolated job queues to prevent cross-workload interference.

Why This Matters

Previously, all jobs shared a single queue.

This meant:

Heavy jobs could delay lightweight jobs

Concurrency limits applied globally

Backpressure from one job type affected all others

Phase 10 introduces workload segmentation.

Active Queues
Queue Name	Job Type	Purpose
email-queue	welcome-email	Email notifications
report-queue	generate-report	Heavy report jobs
cleanup-queue	cleanup-temp	Maintenance tasks

Each queue:

Has independent FIFO ordering

Has independent concurrency configuration

Is processed by its own Worker instance

Per-Queue Concurrency

Example configuration:

Queue	Concurrency
email-queue	3
report-queue	2
cleanup-queue	1

This enables workload-aware resource allocation.

Isolation Guarantees

Heavy report jobs cannot delay email jobs

Cleanup tasks cannot block report generation

Retry storms remain confined to their queue

DLQ behavior remains correct per job type

Isolation is implemented at the Redis queue level.

Scaling Model

Total parallel execution:

(number of workers) × (sum of per-queue concurrency)

Example:

1 worker → 6 parallel jobs
2 workers → 12 parallel jobs

This provides both horizontal and segmented scaling.

After Phase 10, the system behaves as a workload-aware distributed job processor rather than a single-queue background worker.


---

## ⚙️ Configuration

All infrastructure configuration is externalized.

### Environment Variables

```bash
REDIS_URL=<redis connection url>
```

During local development, this value is stored in a `.env` file and loaded using `dotenv`.

**Security Note:** No credentials are hardcoded or committed to version control.

---

## 🚀 Getting Started

See `STARTUP.md` for detailed setup and run instructions.

### Quick Start

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables in `.env`
4. Start Redis (or use a managed Redis service)
5. Run the system: `npm run dev`

---

## 📁 Project Structure

```
.
├── src/
│   ├── api/          # Express API server
│   ├── worker/       # Job consumer/processor
│   ├── scheduler/    # Scheduled job producer
│   └── queue/        # BullMQ queue configuration
├── .env.example      # Environment variable template
├── PROJECT_CONTEXT.md # Architectural decisions and history
├── README.md         # This file
└── STARTUP.md        # Detailed setup instructions
```

---

## 🎓 Learning Outcomes

This project demonstrates:

- How to build reliable asynchronous systems
- Producer-consumer pattern implementation
- Idempotent API design
- Retry and backoff strategies
- State management with Redis
- Process isolation and fault tolerance
- Scheduled task execution
- Clean architecture principles

---

## 📝 License

This project is intended for educational and demonstration purposes.

---

## 🤝 Contributing

This is a learning project. Feel free to fork and experiment with different job types, queue configurations, and scaling strategies.

---

**Built with ❤️ to demonstrate production-grade background job processing**
