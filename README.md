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

Configuration

All infrastructure configuration is externalized.

Environment Variables
REDIS_URL=<redis connection url>


During local development, this value is stored in a .env file and loaded using dotenv.

No credentials are hardcoded or committed to version control.

Running the Project

See STARTUP.md for detailed startup instructions.

