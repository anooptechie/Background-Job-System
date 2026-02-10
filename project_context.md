# PROJECT_CONTEXT.md

This document captures stable architectural decisions and system behavior for the background job processing system. It excludes experimentation, debugging history, and implementation noise.

---

## Project Purpose

The system demonstrates production-grade background job processing beyond simple request–response APIs.

### Primary Goals

- Decouple job creation from execution
- Ensure durability of background work
- Make asynchronous workflows observable
- Avoid overengineering while preserving correctness

---

## Architecture Decisions

### Producer–Consumer Model

- **API server** acts as a job producer
- **Worker process** acts as a job consumer
- **Redis** acts as a durable intermediary

API and worker lifecycles are fully independent, enabling horizontal scaling and fault isolation.

---

## Job Lifecycle (Phase 2)

Jobs have a well-defined lifecycle managed by BullMQ and Redis.

### Observed States

- `waiting` – Job is queued but not yet being processed
- `active` – Job is currently being processed by a worker
- `completed` – Job finished successfully
- `failed` – Job execution failed

### Key Decisions

- Job state is sourced directly from BullMQ
- No custom job-status database is introduced
- No duplication of job metadata
- Status access is read-only

**Note:** Jobs may remain in `waiting` state when no workers are running. This behavior is intentional and correct.

---

## Job Status API

A single endpoint is exposed for job status queries:

```
GET /jobs/:id/status
```

### Design Principles

- One endpoint for all job states
- No state-specific endpoints
- No polling strategy enforced by the backend
- Clients decide how and when to query status

This approach aligns with real-world async system design patterns.

---

## Job Input Contract (Phase 1–2)

Jobs are submitted as structured JSON objects with:

- `type` – Identifies the job category
- `payload` – Contains job-specific data and metadata

### Example

```json
{
  "type": "welcome-email",
  "payload": {
    "email": "anoop@example.com",
    "name": "Anoop",
    "message": "Congratulations! Your background job system is live."
  }
}
```

---

## Configuration Strategy

All environment-specific configuration is externalized.

- Redis connection details are provided via `REDIS_URL`
- `.env` is used for local development convenience
- `process.env` is the runtime source of truth
- No credentials are committed to version control

---

## Tooling Decisions

- **Postman** is used during development to simulate realistic client requests
- **nodemon** and **concurrently** improve development workflow without altering architecture
- `curl` is not a required part of the system design

---

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

---

## Idempotency & Safety (Phase 4)

Phase 4 focused on making the background job system safe under retries, duplicate submissions, and worker crashes.

### Key Outcomes

- Introduced client-defined idempotency keys to prevent duplicate jobs
- Enforced strict API validation to protect the idempotency contract
- Decoupled semantic intent (`idempotencyKey`) from system identity (`jobId`)
- Implemented a Redis-based reservation pattern to guarantee at-most-once execution of side effects
- Verified correct behavior through extensive edge-case testing

### Design Principle

> Idempotency expresses intent.  
> Job IDs enforce safety.  
> Side effects must be protected before execution.

### System Guarantees

The system now behaves correctly under:

- Duplicate API requests
- Retries due to transient failures
- Worker crashes and restarts

Phase 4 marks the completion of the system's safety and correctness goals.

---

## Background-Only & Scheduled Jobs (Phase 5)

Phase 5 focused on removing the dependency on HTTP requests for job creation and enabling system-driven background workflows.

### Phase 5.1 – System Producer

- Added a standalone Node.js script that enqueues jobs directly
- Reused existing queue and idempotency logic
- Confirmed that workers can process jobs created outside the API lifecycle

### Phase 5.2 – Scheduled Jobs

- Implemented a simple scheduler using `setInterval`
- Scheduler runs as an independent process
- Jobs are triggered periodically without user interaction

### Phase 5.3 – Safety & Correctness

- Introduced time-bucketed idempotency keys for scheduled jobs
- Prevented duplicate job creation across restarts
- Ensured retries and side-effect safety remain intact
- Kept scheduler stateless and lightweight

### Key Learnings

- Background systems should not rely on HTTP as the only entry point
- Idempotency is critical for scheduled and system-triggered workflows
- Redis acts as the single source of truth across all producers
- Simple scheduling mechanisms can be safe if correctness rules are enforced

Phase 5 completes the system's transition to autonomous background processing.

---

## Version Status

**Current Phase:** Phase 5 Complete

The system now supports:

- API-triggered jobs
- System-triggered jobs
- Scheduled jobs

All with:

- Idempotent job creation
- Retry-safe execution
- At-most-once side effects
- Redis as the source of truth

Observability & Monitoring (Phase 6)

Phase 6 focused on making the system observable under real execution conditions without changing job semantics, control flow, or failure behavior.

The goal was to ensure that background job execution can be understood, measured, and trusted during success, failure, retries, and recovery scenarios.

Logging Decisions

Replaced ad-hoc console logging in the worker with structured logs

Enforced consistent job-level correlation using jobId

Logs represent execution events, not request–response flows

Log ordering is intentionally non-linear due to asynchronous execution

This enables reliable reconstruction of a job’s lifecycle across retries, crashes, and worker restarts.

Metrics Decisions

The system now emits Prometheus-compatible metrics from the worker process.

Metrics are strictly observational and never influence execution logic.

Recorded metrics include:

Job execution counters

Successful executions

Failed execution attempts (including retries)

Execution latency histograms

Recorded only for successful job executions

Bucketed to reveal performance distribution rather than averages

Failed executions are intentionally excluded from latency histograms to prevent skewed performance signals.

Metrics Exposure Model

The API process exposes /metrics for API and process-level metrics

The worker process exposes /metrics on a separate port for job execution metrics

Metrics are process-local and not shared across memory boundaries

This mirrors real-world production systems where workers scale independently and expose their own operational signals.

Observability Guarantees

After Phase 6, the system can reliably answer:

How many jobs are executed per job type?

How many failure and retry events occur?

How long successful jobs take to execute (distribution, not averages)?

Whether retries and recovery paths behave as expected

Phase 6 establishes observability as a first-class system capability and forms the foundation for safe scaling, explicit DLQs, and operational alerting in later phases.

1️⃣ Update PROJECT_CONTEXT.md (Phase 7)

📍 Where to add
Append this as a new section after Phase 6, before any “Future” or “Next” sections.

Dead Letter Queue (DLQ) – Phase 7

Phase 7 introduced an explicit Dead Letter Queue (DLQ) to isolate terminal job failures from normal job processing.

The goal of this phase was to separate transient failures from permanent failures while preserving observability and correctness guarantees established in earlier phases.

DLQ Design Decisions

A job is considered dead only after all retry attempts are exhausted

Only terminal failures are moved to the DLQ

DLQ is implemented as a separate BullMQ queue

No worker is attached to the DLQ

DLQ is write-only in this phase

This ensures retries behave normally and DLQ usage is explicit and intentional.

DLQ Semantics

Retry failures do not enter the DLQ

A job enters the DLQ exactly once

Normal job execution remains unaffected

DLQ jobs are inert and do not trigger side effects

This prevents retry storms, cascading failures, and hidden execution paths.

DLQ Payload Strategy

Each DLQ entry preserves sufficient context for inspection and future replay:

Original job ID

Job type

Original payload

Failure reason

Attempts made

Failure timestamp

The DLQ acts as a durable audit record, not an automated recovery mechanism.

DLQ Observability

Phase 7 extends observability with a dedicated DLQ metric:

dlq_jobs_total

Counts jobs that permanently failed

Labeled by job type

This cleanly separates:

execution failures (retry-level)

terminal failures (DLQ-level)

Phase Outcome

After Phase 7, the system guarantees:

Clear distinction between transient and terminal failures

Safe isolation of permanently failed jobs

Durable and inspectable failure records

Metrics that reflect true system health

Phase 7 completes the failure lifecycle model, enabling future work such as replay, alerting, and operational workflows.

DLQ Replay Semantics (Phase 8)

Phase 8 introduced explicit and safe replay semantics for jobs stored in the Dead Letter Queue (DLQ).

The goal of this phase was to enable intentional recovery from terminal failures without compromising correctness, idempotency, or observability guarantees.

Replay Design Principles

Replay is treated as an operational action, not an automated system behavior.

Key principles:

Replay always creates a new job

Original jobs and DLQ records are never mutated

Replay is manual and explicit

Workers remain unaware of replay mechanics

This ensures replay does not bypass retry logic or execution safeguards.

Replay Semantics

DLQ entries are replayed by DLQ Job ID, not original job ID

Replay enqueues a new job into the primary queue

A new job ID is always generated

Lineage is preserved via metadata:

replayedFromJobId

replayedAt

The original DLQ entry remains as a durable audit record.

Failure and Replay Interaction

A replayed job may succeed or fail independently

If a replayed job fails permanently, it creates a new DLQ entry

No automatic replay loops exist

Each replay represents an explicit human decision

This prevents infinite failure cycles and hidden recovery behavior.

Observability Guarantees

Replay semantics preserve all observability guarantees:

Job execution metrics reflect replayed jobs as normal executions

DLQ metrics remain historical and append-only

Logs clearly distinguish replayed jobs via lineage metadata

Replay does not alter existing metrics semantics.

Phase Outcome

After Phase 8, the system guarantees:

Safe recovery from terminal job failures

Clear separation between retry and replay semantics

Full auditability of failures and recovery attempts

No hidden or automatic execution paths

Phase 8 completes the failure recovery lifecycle, enabling confident operation and future scaling.