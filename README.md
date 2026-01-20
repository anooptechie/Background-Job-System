# Background Job & Task Processing System

This project demonstrates how to design and build a background job processing system that works outside the HTTP request–response lifecycle.

The system allows jobs to be created via an API, queued reliably using Redis, and processed asynchronously by independent worker processes.

---

## Core Capabilities

- Asynchronous job execution
- Durable job queuing using Redis
- Independent API and worker processes
- Observable job lifecycle with status tracking
- Clean separation of concerns (producer vs consumer)

---

## Tech Stack

- Node.js
- Express.js
- BullMQ
- Redis (managed Redis via Upstash during development)
- ioredis
- dotenv
- nodemon
- concurrently

---

## Architecture Overview

- **API Server**  
  Acts as a job producer. Accepts job requests and enqueues them.

- **Redis Queue**  
  Serves as a durable intermediary between API and workers.

- **Worker Process**  
  Consumes jobs from the queue and executes them asynchronously.

API availability and worker availability are fully decoupled.

---

## Job Submission

Jobs are submitted via `POST /jobs` as structured JSON payloads.

During development, **Postman** is used as the primary client to simulate real application requests.

### Example Request Body

```json
{
  "type": "welcome-email",
  "payload": {
    "email": "Albert@example.com",
    "name": "Albert",
    "message": "Congratulations! Your background job system is live."
  }
}

Example Response
json
Copy code
{
  "status": "accepted",
  "jobId": "15"
}
The API responds immediately. Job execution happens asynchronously.

Job Lifecycle & Status Tracking (Phase 2)

Each job has an observable lifecycle managed internally by BullMQ.

Job States

waiting — job is queued but no worker is processing it yet

active — job is currently being processed

completed — job finished successfully

failed — job execution failed

Jobs can remain in the waiting state even if no worker is running.

Job Status API

The system exposes a read-only endpoint to query job status:

GET /jobs/:id/status

Example Response
{
  "jobId": "15",
  "type": "welcome-email",
  "state": "waiting",
  "createdAt": "2026-01-18T10:12:30.000Z",
  "processedAt": null,
  "failedReason": null
}

This confirms that job creation and job execution are fully decoupled.

## Failure Handling, Retries & Backoff (Phase 3)

The system is designed to handle failures without crashing workers or blocking other jobs.

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

## Idempotency & Safety (Phase 4)

This system guarantees safe background job processing under retries,
crashes, and duplicate requests.

### Idempotent Job Creation
- Clients must provide an `idempotencyKey` for every job
- Duplicate requests with the same key result in a single job
- Idempotency keys are hashed to generate Redis/BullMQ-safe job IDs
- Internal job IDs are never reused as client idempotency keys

### Retry-Safe Side Effects
- Side effects are protected using a Redis reservation pattern (`SET NX`)
- Side effects execute at most once, even if a worker crashes
- Retries stop as soon as a job successfully completes
- Failed jobs are retried up to a fixed limit and then dead-lettered

### Observability Guarantees
- Job states (`waiting`, `active`, `completed`, `failed`) accurately reflect execution
- Worker logs distinguish between:
  - normal success
  - recovery success after retries

### Design Principle
> Idempotency expresses intent.  
> Job IDs enforce safety.  
> Side effects must be protected before execution.

## Phase 5 — Background-Only & Scheduled Jobs

Phase 5 extends the system beyond HTTP-triggered jobs.  
Jobs can now be created and executed **entirely by the system itself**.

This models real backend workflows such as cron jobs, maintenance tasks,
and internal background processing.

---

### Phase 5.1 — System-Initiated Jobs (No HTTP)

- Introduced a **system producer** that enqueues jobs without any API call
- Jobs are created by running a Node.js script
- Reuses the same queue, Redis connection, and idempotency logic
- Worker remains unchanged

This proves that job producers are not tied to HTTP and can exist independently.

---

### Phase 5.2 — Scheduled Jobs (Cron-like)

- Added a lightweight scheduler using `setInterval`
- Scheduler runs as a separate process
- Jobs are triggered on a fixed time interval
- No external cron or infrastructure required

---

### Phase 5.3 — Safety Rules for Scheduled Jobs

To prevent duplication and unsafe execution:

- Scheduled jobs use **time-bucketed idempotency keys**
- Same time window → same job → no duplicates
- Scheduler is stateless and restart-safe
- Worker retries and side-effect safety remain enforced

---

### Key Outcome

The system now supports:
- API-triggered jobs
- System-triggered jobs
- Scheduled jobs

All with:
- idempotent job creation
- retry-safe execution
- at-most-once side effects
- Redis as the source of truth

This completes the transition from request-response background work
to autonomous backend processing.


Configuration

All infrastructure configuration is externalized.

Environment Variables
REDIS_URL=<redis connection url>

During local development, this value is stored in a .env file and loaded using dotenv.

No credentials are hardcoded or committed to version control.

Running the Project

See STARTUP.md for detailed startup instructions.

