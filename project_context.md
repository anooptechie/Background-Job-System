# 📘 PROJECT_CONTEXT.md

```md
# PROJECT_CONTEXT.md

This document captures stable architectural decisions and system behavior.
It excludes experimentation, debugging history, and implementation noise.

---

## Project Purpose

The system is designed to demonstrate background job processing beyond simple request–response APIs.

Primary goals:

- Decouple job creation from execution
- Ensure durability of background work
- Make asynchronous workflows observable
- Avoid overengineering while preserving correctness

---

## Architecture Decisions

### Producer–Consumer Model

- API server acts as a **job producer**
- Worker process acts as a **job consumer**
- Redis acts as a durable intermediary

API and worker lifecycles are fully independent.

---

## Job Lifecycle (Frozen — Phase 2)

Jobs have a well-defined lifecycle managed by BullMQ and Redis.

Observed states include:

- `waiting`
- `active`
- `completed`
- `failed`

Key decisions:

- Job state is sourced directly from BullMQ
- No custom job-status database is introduced
- No duplication of job metadata
- Status access is read-only

Jobs may remain in `waiting` state when no workers are running. This behavior is intentional and correct.

---

## Job Status API

A single endpoint is exposed for job status:
GET /jobs/:id/status


Design principles:

- One endpoint for all job states
- No state-specific endpoints
- No polling strategy enforced by the backend
- Clients decide how and when to query status

This approach aligns with real-world async system design.

---

## Job Input Contract (Phase 1–2)

Jobs are submitted as structured JSON objects with:

- `type` — identifies the job category
- `payload` — contains job-specific data and metadata

Example:

```json
{
  "type": "welcome-email",
  "payload": {
    "email": "anoop@example.com",
    "name": "Anoop",
    "message": "Congratulations! Your background job system is live."
  }
}

Configuration Strategy

All environment-specific configuration is externalized

Redis connection details are provided via REDIS_URL

.env is used for local development convenience

process.env is the runtime source of truth

No credentials are committed to version control.

Tooling Decisions

Postman is used during development to simulate realistic client requests

curl is not a required part of the system design anymore

Developer tooling (nodemon, concurrently) improves workflow without altering architecture

Version Status

Phase 2 complete

Job lifecycle is observable

Background processing is durable and decoupled

## Failure Handling & Reliability (Phase 3)

The system is designed to tolerate and isolate job failures without compromising overall stability.

### Failure Model
- Job failures are signaled by throwing errors in the worker
- Workers are not responsible for retry logic
- A failed job does not affect other jobs or worker availability

### Retry Strategy
- Retries are configured at job creation time
- A fixed maximum number of retry attempts is enforced
- Retry execution is managed entirely by BullMQ

### Backoff Policy
- A fixed backoff delay is applied between retries
- This prevents immediate retry loops and retry storms

### Dead-Letter Behavior
- Jobs that exhaust all retry attempts transition to a terminal `failed` state
- Failed jobs remain stored and queryable
- No infinite retry loops are possible

These behaviors are considered stable and form the reliability foundation for future phases.

## Phase 4 — Idempotency & Safety

Phase 4 focused on making the background job system safe under retries,
duplicate submissions, and worker crashes.

Key outcomes:
- Introduced client-defined idempotency keys to prevent duplicate jobs
- Enforced strict API validation to protect the idempotency contract
- Decoupled semantic intent (idempotencyKey) from system identity (jobId)
- Implemented a Redis-based reservation pattern to guarantee at-most-once
  execution of side effects
- Verified correct behavior through extensive edge-case testing

This phase highlighted the importance of testing failure modes,
not just happy paths. Several subtle bugs were discovered and fixed by
intentionally misusing the system and observing Redis state and worker logs.

The system now behaves correctly under:
- duplicate API requests
- retries due to transient failures
- worker crashes and restarts

Phase 4 marks the completion of the system’s safety and correctness goals.

## Phase 5 — Background-Only & Scheduled Jobs

Phase 5 focused on removing the dependency on HTTP requests for job creation
and enabling system-driven background workflows.

### Phase 5.1 — System Producer
- Added a standalone Node.js script that enqueues jobs directly
- Reused existing queue and idempotency logic
- Confirmed that workers can process jobs created outside the API lifecycle

### Phase 5.2 — Scheduled Jobs
- Implemented a simple scheduler using `setInterval`
- Scheduler runs as an independent process
- Jobs are triggered periodically without user interaction

### Phase 5.3 — Safety & Correctness
- Introduced time-bucketed idempotency keys for scheduled jobs
- Prevented duplicate job creation across restarts
- Ensured retries and side-effect safety remain intact
- Kept scheduler stateless and lightweight

### Key Learnings
- Background systems should not rely on HTTP as the only entry point
- Idempotency is critical for scheduled and system-triggered workflows
- Redis acts as the single source of truth across all producers
- Simple scheduling mechanisms can be safe if correctness rules are enforced

Phase 5 completes the system’s transition to autonomous background processing.

