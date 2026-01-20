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

| State | Description |
|-------|-------------|
| `waiting` | Job is queued but not yet being processed |
| `active` | Job is currently being processed by a worker |
| `completed` | Job finished successfully |
| `failed` | Job execution failed after all retry attempts |

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