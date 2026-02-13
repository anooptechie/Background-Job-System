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

Horizontal Scaling & Worker Concurrency (Phase 9)

Phase 9 introduced horizontal and vertical scaling capabilities to validate the system under concurrent load.

This phase tested the architectural assumptions made in earlier phases, particularly idempotency, retry safety, DLQ behavior, and observability under multi-worker execution.

Horizontal Scaling (Multiple Workers)

Multiple worker processes were started simultaneously, all consuming from the same jobs-queue.

Key properties validated:

Jobs are distributed across workers

A single job is processed by only one worker at a time

Retries may be handled by different workers

DLQ behavior remains correct under concurrent failures

No duplicate side effects occurred

BullMQ uses Redis-based locking to ensure exclusive job processing across workers.

Vertical Scaling (Per-Worker Concurrency)

Worker concurrency was increased using:

{
  connection,
  concurrency: 3
}


This allows a single worker to process multiple jobs concurrently.

Observations:

Multiple jobs start execution immediately within the same worker

Throughput increases proportionally for I/O-bound jobs

Idempotency safeguards continue to prevent duplicate side effects

Metrics remain accurate per worker instance

Observability Under Scale

Each worker exposes its own /metrics endpoint on a separate port.

Metrics are:

Process-local

Independent per worker

Aggregation-ready (via external monitoring tools)

This mirrors real distributed monitoring setups.

Retry Distribution Behavior

Under concurrent load:

A job's retry attempts may be executed by different workers

Worker affinity is not enforced

Locking ensures only one worker processes a job attempt at a time

This behavior is expected and desirable in distributed queue systems.

Throughput Validation

Controlled experiments were performed:

Baseline with concurrency = 1

Increased concurrency = 3

Measured execution time reduction

Observed near-linear improvement for I/O-bound workloads

This confirms the system scales both horizontally and vertically.

Phase 9 Outcome

After Phase 9, the system now supports:

Multi-process distributed execution

Per-worker concurrency scaling

Safe retry handling across workers

Correct DLQ behavior under concurrent load

Observable metrics per worker instance

Verified throughput improvements

Phase 9 transitions the system from a single-node job processor to a scalable distributed worker cluster

Queue Isolation & Workload Segmentation (Phase 10)

Phase 10 introduced queue isolation to separate heterogeneous workloads into independent processing lanes.

The goal of this phase was to prevent noisy-neighbor effects and enable workload-specific scaling strategies.

Motivation

In earlier phases, all job types shared a single queue.

This design works functionally but has operational limitations:

Heavy jobs can delay lightweight jobs

Concurrency tuning applies globally

Throughput fairness cannot be enforced

Backpressure from one workload affects all workloads

Phase 10 resolves this by isolating job types into dedicated queues.

Multi-Queue Architecture

The system now maintains multiple BullMQ queues:

email-queue

report-queue

cleanup-queue

Each queue:

Is backed by Redis

Has independent FIFO ordering

Is processed by a dedicated Worker instance

Maintains separate waiting, active, completed, and failed states

This ensures workload isolation at the queue level.

Type-to-Queue Mapping

Job types are explicitly mapped to queues:

welcome-email → email-queue

generate-report → report-queue

cleanup-temp → cleanup-queue

This mapping is enforced centrally via a queue registry.

Unsupported job types are rejected at API validation time.

Per-Queue Concurrency Model

Each queue has independent concurrency settings:

Email jobs: medium weight

Report jobs: heavy weight

Cleanup jobs: lightweight

Concurrency is configured per queue rather than globally.

This allows:

Fine-grained resource allocation

Workload-aware scaling

Predictable throughput tuning

Isolation Guarantees

Queue isolation ensures:

Heavy report jobs cannot delay email jobs

Cleanup tasks do not block other workloads

Retry storms remain confined to a single queue

DLQ behavior remains queue-aware

Metrics remain labeled per job type

Isolation occurs at the Redis queue level, not at the worker process level.

Scaling Model After Phase 10

Total parallel execution capacity now equals:

Sum of (per-queue concurrency × number of worker processes)

Example:

1 worker process:

email (3)

report (2)

cleanup (1)

Total parallel jobs = 6

2 worker processes:
Total parallel jobs = 12

Scaling is both horizontal (more workers) and segmented (per-queue tuning).

Observability Under Isolation

Metrics remain labeled by job type.

Queue isolation does not alter:

Retry semantics

DLQ behavior

Idempotency guarantees

Side-effect protection

Isolation improves workload fairness without changing correctness guarantees.

Phase 10 Outcome

After Phase 10, the system now guarantees:

Workload segmentation

Independent queue backpressure

Fair job scheduling across job types

Predictable scaling behavior

Safe extension for future job categories

Phase 10 transitions the system from a monolithic queue processor to a workload-aware distributed job platform.

Graceful Shutdown & Worker Lifecycle Management (Phase 11)

Phase 11 introduced graceful shutdown handling to ensure safe worker termination during process interrupts, container restarts, and deployment rollouts.

The goal was to guarantee that active jobs complete safely before the worker exits.

Problem Addressed

Without graceful shutdown:

Active jobs could be interrupted mid-execution

Side effects could remain partially applied

Redis connections could close abruptly

Metrics servers could leak open ports

Containers could terminate unsafely

This behavior is unacceptable in distributed production systems.

Shutdown Strategy

The worker now listens for:

SIGTERM (container orchestration signals)

SIGINT (manual interrupts)

On receiving a shutdown signal:

Stop fetching new jobs

Allow active jobs to complete

Close all BullMQ worker instances

Close the metrics HTTP server

Close the Redis connection

Exit cleanly

This guarantees controlled process termination.

Worker Close Semantics

worker.close() ensures:

No new jobs are pulled from Redis

In-progress jobs are allowed to finish

Locks are released safely

Retry behavior remains intact

No job is abandoned mid-execution.

Side-Effect Safety Under Shutdown

Because side effects are protected via Redis reservation (SET NX):

Interrupted executions do not duplicate side effects

Retries remain safe

Shutdown does not compromise idempotency guarantees

Phase 11 reinforces correctness guarantees established in Phase 4.

Observability During Shutdown

Shutdown emits structured logs:

worker.shutdown_initiated

worker.shutdown_complete

worker.shutdown_error (if any)

This provides operational visibility during deployment events.

Deployment Safety

After Phase 11, the system supports:

Docker container restarts

Kubernetes rolling deployments

Zero-downtime worker replacement

Safe scale-down operations

Worker processes are now production-safe under lifecycle events.

Phase 11 Outcome

After Phase 11, the system guarantees:

No partial job execution during shutdown

No side-effect duplication during interrupts

Clean Redis disconnection

Clean metrics server shutdown

Deterministic process termination

Phase 11 transitions the worker from development-safe to production-safe lifecycle management.

Queue Depth Metrics & Backpressure Awareness (Phase 12)

Phase 12 introduces queue depth metrics to provide operational visibility into workload pressure and backlog growth.

Until this phase, the system tracked:

Total jobs processed

Failures

Execution latency

DLQ events

However, it lacked visibility into queue buildup and active workload pressure.

Problem Addressed

Without queue depth metrics:

It is impossible to detect backlog growth.

Under-provisioned queues cannot be identified.

Heavy workloads cannot be distinguished from normal traffic.

Scaling decisions are reactive rather than data-driven.

Phase 12 resolves this by exposing real-time queue depth metrics.

Metrics Introduced

For each queue:

queue_waiting_jobs

queue_active_jobs

queue_delayed_jobs

All metrics are labeled by queue name.

Example:

queue_waiting_jobs{queue="report-queue"} 8
queue_active_jobs{queue="report-queue"} 2
queue_delayed_jobs{queue="report-queue"} 0

Collection Strategy

Queue counts are polled at a fixed interval (5 seconds) using non-blocking asynchronous calls.

Key properties:

Metrics collection does not block job processing.

Metrics polling is cleared during graceful shutdown.

Redis load impact is minimal and controlled.

Worker processing remains unaffected.

Operational Impact

Queue depth metrics enable:

Detection of workload backpressure

Identification of under-provisioned queues

Fair workload isolation validation

Scaling decisions based on real backlog data

Alert threshold configuration

For example:

If:

queue_waiting_jobs{queue="report-queue"} 75


And:

queue_waiting_jobs{queue="email-queue"} 0


This indicates report queue pressure without affecting email workload — validating isolation behavior introduced in Phase 10.

Scaling Model Enhancement

With Phase 12, scaling is now informed by:

Per-queue backlog

Active concurrency limits

Latency trends

Failure rates

The system transitions from reactive scaling to observable, data-driven scaling.

Phase 12 Outcome

After Phase 12, the system now provides:

Full workload visibility

Backpressure awareness

Queue-level operational intelligence

Observability aligned with distributed system best practices

The system now supports informed scaling rather than blind scaling.

Per-Queue Rate Limiting & Throughput Control (Phase 13)

Phase 13 introduces rate limiting at the worker level to control job execution velocity and protect downstream dependencies from overload.

Prior phases introduced concurrency limits, but concurrency alone does not control how frequently new jobs begin execution. Without rate limiting, horizontally scaled workers could overwhelm external services such as email providers, databases, or third-party APIs.

Phase 13 resolves this by enforcing per-queue execution rate limits.

Problem Addressed

Concurrency limits control parallel execution, but do not restrict execution frequency.

Without rate limiting:

Workers can start jobs faster than downstream systems can handle.

Horizontal scaling multiplies execution velocity uncontrollably.

External services may throttle, fail, or degrade.

Retry storms can amplify system load.

Rate limiting ensures execution velocity remains within safe operational bounds.

Rate Limiting Model

Rate limiting is configured per queue using BullMQ’s native limiter mechanism.

Each queue defines:

Maximum number of jobs allowed per duration window

Independent execution velocity constraints

Example configuration:

email-queue → 5 jobs per second

report-queue → 2 jobs per second

cleanup-queue → 1 job per second

This ensures workload-specific throughput control.

Concurrency vs Rate Limiting

Concurrency and rate limiting control different dimensions:

Concurrency limits:

Maximum number of simultaneous jobs

Rate limits:

Maximum number of jobs started per time interval

Both mechanisms work together to shape workload execution safely.

Isolation Guarantees Under Rate Limiting

Because queues are isolated (Phase 10):

Rate limits apply independently per queue

Heavy workloads cannot throttle unrelated queues

Email jobs remain unaffected by report job throttling

Cleanup operations remain isolated from other workloads

This preserves workload independence while enforcing throughput control.

Operational Impact

Rate limiting enables:

Protection of downstream systems

Controlled execution velocity

Safe horizontal scaling

Retry storm containment

Predictable workload execution behavior

This transitions the system from unconstrained execution to controlled throughput execution.

Phase 13 Outcome

After Phase 13, the system now provides:

Workload isolation

Concurrency control

Backpressure visibility

Graceful lifecycle management

Throughput control via rate limiting

The system now supports safe, scalable, and controlled distributed job execution aligned with production-grade system design principles.

Integrated Operational Observability (Phase 14 – BullBoard)

Phase 14 introduces a centralized operational dashboard to provide real-time inspection and management of all job queues.

As the system scaled in complexity, reliance on logs and Redis CLI became insufficient for efficient debugging and operational control.

BullBoard was integrated into the existing Express API server to provide a unified entry point for both API traffic and human operational interaction.

Architectural Integration

Mounted at /admin/queues

Uses ExpressAdapter

Uses BullMQAdapter

Dynamically maps queues from queueRegistry

Includes dead-letter-queue

This ensures minimal overhead when new queues are added.

Operational Capabilities

Real-Time Inspection:

View job payloads

Track state transitions

Inspect failure stack traces

Monitor retry attempts

Manual Intervention:

Retry failed jobs

Remove poison-pill jobs

Clean queue states

Inspect DLQ entries

Cluster-Wide Visibility:

Because the dashboard connects directly to Redis, it reflects the global state of all workers regardless of deployment topology.

Secured Operational Surface (Phase 14.1)

Phase 14.1 secures the BullBoard dashboard using Basic Authentication middleware.

Security Controls

Route protection via basicAuth middleware

Credentials defined via environment variables

No hardcoded secrets

Unauthorized access returns HTTP 401

Operational Impact

Phase 14 and 14.1 together provide:

Reduced debugging time

Interactive operational recovery

Controlled administrative access

Secure management interface

The system now includes both programmatic and authenticated human-operable observability layers.

Payload Validation & System Boundary Hardening (Phase 15)

Phase 15 formalizes the API boundary by introducing structured payload validation using Zod.

Prior to this phase, validation logic relied on manual conditional checks. While functional, this approach was brittle and less expressive.

Phase 15 replaces manual validation with schema-driven enforcement.

Architectural Motivation

Distributed systems must protect internal components from untrusted input.

Without strict boundary validation:

Invalid jobs enter Redis

Workers process malformed data

DLQ contains user errors

Observability signals become polluted

Phase 15 establishes a clear trust boundary at the API layer.

Design Principles

Validation occurs before enqueue

Each job type has a dedicated schema

Validation is centralized and extensible

Invalid requests are rejected with 400

Worker logic assumes validated payloads

Domain Enforcement

Schemas enforce:

Required fields per job type

Proper data types

Email format validation

Optional test flags (forceFail)

This formalizes domain contracts between producers and consumers.

System Impact

Phase 15:

Protects Redis from malformed data

Prevents unnecessary DLQ entries

Preserves metric accuracy

Reduces wasted compute

Strengthens overall system integrity

With Phase 15 complete, the system now has a hardened input boundary aligned with production-grade backend practices.