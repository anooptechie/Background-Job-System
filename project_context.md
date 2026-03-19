# PROJECT_CONTEXT.md

This document captures stable architectural decisions, design principles, and phase-by-phase system evolution for the background job processing system. It excludes experimentation, debugging history, and implementation noise.

---

## Table of Contents

- [Project Purpose](#project-purpose)
- [Architecture Decisions](#architecture-decisions)
- [Phase 1–2 — Job Lifecycle & Status API](#phase-12--job-lifecycle--status-api)
- [Phase 3 — Failure Handling & Reliability](#phase-3--failure-handling--reliability)
- [Phase 4 — Idempotency & Safety](#phase-4--idempotency--safety)
- [Phase 5 — Background-Only & Scheduled Jobs](#phase-5--background-only--scheduled-jobs)
- [Phase 6 — Observability & Monitoring](#phase-6--observability--monitoring)
- [Phase 7 — Dead Letter Queue (DLQ)](#phase-7--dead-letter-queue-dlq)
- [Phase 8 — DLQ Replay Semantics](#phase-8--dlq-replay-semantics)
- [Phase 9 — Horizontal Scaling & Worker Concurrency](#phase-9--horizontal-scaling--worker-concurrency)
- [Phase 10 — Multi-Queue Workload Isolation](#phase-10--multi-queue-workload-isolation)
- [Phase 11 — Graceful Shutdown & Lifecycle Safety](#phase-11--graceful-shutdown--lifecycle-safety)
- [Phase 12 — Queue Depth Metrics & Backpressure Awareness](#phase-12--queue-depth-metrics--backpressure-awareness)
- [Phase 13 — Per-Queue Rate Limiting & Throughput Control](#phase-13--per-queue-rate-limiting--throughput-control)
- [Phase 14 — Operational Dashboard (BullBoard)](#phase-14--operational-dashboard-bullboard)
- [Phase 14.1 — Secured Dashboard](#phase-141--secured-dashboard)
- [Phase 15 — Payload Validation & Boundary Hardening](#phase-15--payload-validation--boundary-hardening)
- [Phase 16 — Dockerised Deployment](#phase-16--dockerised-deployment)
- [Phase 17 — Continuous Integration](#phase-17--continuous-integration)

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

### Configuration Strategy

All environment-specific configuration is externalized.

- Redis connection details are provided via `REDIS_URL`
- `.env` is used for local development convenience
- `process.env` is the runtime source of truth
- No credentials are committed to version control

### Tooling Decisions

- **Postman** is used during development to simulate realistic client requests
- **nodemon** and **concurrently** improve development workflow without altering architecture
- `curl` is not a required part of the system design

---

## Phase 1–2 — Job Lifecycle & Status API

### Job Input Contract

Jobs are submitted as structured JSON objects with:

- `type` — Identifies the job category
- `payload` — Contains job-specific data and metadata

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

### Job Lifecycle

Jobs have a well-defined lifecycle managed by BullMQ and stored in Redis.

| State | Description |
|---|---|
| `waiting` | Job is queued but not yet being processed |
| `active` | Job is currently being processed by a worker |
| `completed` | Job finished successfully |
| `failed` | Job execution failed |

> **Note:** Jobs may remain in `waiting` state when no workers are running. This behavior is intentional and correct.

### Key Decisions

- Job state is sourced directly from BullMQ — no custom status database is introduced
- No duplication of job metadata
- Status access is read-only

### Job Status API

A single endpoint is exposed for job status queries:

```
GET /jobs/:id/status
```

**Design principles:**
- One endpoint for all job states — no state-specific endpoints
- No polling strategy enforced by the backend
- Clients decide how and when to query status

This approach aligns with real-world async system design patterns.

---

## Phase 3 — Failure Handling & Reliability

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

These behaviors form the reliability foundation for all future phases.

---

## Phase 4 — Idempotency & Safety

Phase 4 focused on making the background job system safe under retries, duplicate submissions, and worker crashes.

### Key Outcomes

- Introduced client-defined idempotency keys to prevent duplicate jobs
- Enforced strict API validation to protect the idempotency contract
- Decoupled semantic intent (`idempotencyKey`) from system identity (`jobId`)
- Implemented a Redis-based reservation pattern (`SET NX`) to guarantee at-most-once execution of side effects
- Verified correct behavior through extensive edge-case testing

### System Guarantees

The system behaves correctly under:

- Duplicate API requests
- Retries due to transient failures
- Worker crashes and restarts

### Design Principle

> **Idempotency expresses intent.**  
> **Job IDs enforce safety.**  
> **Side effects must be protected before execution.**

Phase 4 marks the completion of the system's core safety and correctness goals.

---

## Phase 5 — Background-Only & Scheduled Jobs

Phase 5 removed the dependency on HTTP requests for job creation, enabling fully system-driven background workflows.

### Phase 5.1 — System Producer

- Added a standalone Node.js script that enqueues jobs directly, without any HTTP call
- Reused existing queue and idempotency logic
- Confirmed that workers process jobs created outside the API lifecycle

### Phase 5.2 — Scheduled Jobs

- Implemented a lightweight scheduler using `setInterval`
- Scheduler runs as an independent process
- Jobs are triggered periodically without user interaction

### Phase 5.3 — Safety & Correctness

- Introduced time-bucketed idempotency keys for scheduled jobs — the same time window always produces the same job ID
- Prevented duplicate job creation across restarts
- Kept the scheduler stateless and lightweight
- Ensured retry and side-effect safety remain fully intact

### Key Learnings

- Background systems should not rely on HTTP as the only entry point
- Idempotency is critical for scheduled and system-triggered workflows
- Redis acts as the single source of truth across all producers
- Simple scheduling mechanisms can be safe if correctness rules are enforced

Phase 5 completes the system's transition to autonomous background processing.

---

## Phase 6 — Observability & Monitoring

Phase 6 focused on making the system observable under real execution conditions without changing job semantics, control flow, or failure behavior.

### Logging Decisions

- Replaced ad-hoc `console.log` calls in the worker with structured, machine-readable logs
- Enforced consistent job-level correlation using `jobId`
- Logs represent execution events, not request–response flows
- Log ordering is intentionally non-linear due to asynchronous execution

Logged events include:

| Event | Meaning |
|---|---|
| `job.started` | Worker has picked up the job |
| `job.side_effect_started` | Side effect execution is beginning |
| `job.completed` | Job finished successfully |
| `job.completed_recovered` | Job completed after one or more retries |
| `job.failed` | Job reached terminal failure state |

This enables reliable reconstruction of a job's full lifecycle across retries, crashes, and restarts.

### Metrics Decisions

The system now emits Prometheus-compatible metrics from the worker process. Metrics are strictly observational and never influence execution logic.

**Execution counters:**
- Successful executions
- Failed execution attempts (including retries)

**Latency histograms:**
- Recorded only for successful job executions
- Bucketed to reveal performance distribution rather than averages
- Failed executions are intentionally excluded to prevent skewed performance signals

**Metrics exposure model:**
- The API process exposes `/metrics` for API and process-level metrics
- The worker process exposes `/metrics` on a separate port for job execution metrics
- Metrics are process-local and not shared across memory boundaries

This mirrors real-world production systems where workers scale independently and expose their own operational signals.

### Observability Guarantees

After Phase 6, the system can reliably answer:

- How many jobs are executed per job type?
- How many failure and retry events occur?
- How long do successful jobs take to execute (distribution, not averages)?
- Whether retries and recovery paths behave as expected

Phase 6 establishes observability as a first-class system capability and forms the foundation for safe scaling, explicit DLQs, and operational alerting.

---

## Phase 7 — Dead Letter Queue (DLQ)

Phase 7 introduced an explicit Dead Letter Queue to isolate terminal job failures from normal job processing, cleanly separating transient failures from permanent ones.

### DLQ Design Decisions

- A job is considered dead only after **all** retry attempts are exhausted
- Only terminal failures are moved to the DLQ — retrying jobs are never considered dead
- The DLQ is implemented as a separate BullMQ queue with no attached worker
- The DLQ is write-only in this phase

### DLQ Semantics

- Jobs enter the DLQ exactly once
- DLQ jobs are inert — they do not trigger side effects
- Normal job execution remains unaffected
- This prevents retry storms, cascading failures, and hidden execution paths

### DLQ Payload Strategy

Each DLQ entry preserves sufficient context for inspection and future replay:

- Original job ID
- Job type
- Original payload
- Failure reason
- Number of attempts
- Failure timestamp

The DLQ acts as a durable audit record, not an automated recovery mechanism.

### DLQ Observability

A dedicated DLQ metric is exposed:

- `dlq_jobs_total` — counts permanently failed jobs, labeled by job type

This cleanly separates execution-level failures (retry metrics) from terminal failures (DLQ metrics).

### Phase 7 Outcome

The system now guarantees:

- Clear distinction between transient and terminal failures
- Safe isolation of permanently failed jobs
- Durable and inspectable failure records
- Metrics that accurately reflect true system health

---

## Phase 8 — DLQ Replay Semantics

Phase 8 introduced explicit and safe replay semantics for jobs stored in the DLQ, enabling intentional recovery from terminal failures without compromising correctness, idempotency, or observability.

### Replay Design Principles

Replay is treated as a deliberate operational action, not an automated system behavior.

- Replay always creates a **new job** — original jobs and DLQ records are never mutated
- Replay is manual and explicit
- Workers remain unaware of replay mechanics
- Replay does not bypass retry logic or execution safeguards

### Replay Semantics

- DLQ entries are replayed by DLQ Job ID, not the original job ID
- Replay enqueues a new job into the primary queue
- A new job ID is always generated
- Lineage is preserved via metadata: `replayedFromJobId`, `replayedAt`, `replayCount`
- The original DLQ entry remains as a durable audit record

### Replay Safety Controls

- Replay count is tracked and limited to prevent infinite replay loops
- Failure-inducing payload flags (e.g. `forceFail`) are stripped on replay
- Each replay represents an explicit operational decision — no automatic replay loops exist

### Failure and Replay Interaction

- A replayed job may succeed or fail independently
- If a replayed job fails permanently, it creates a **new** DLQ entry
- Previous DLQ entries remain intact and unmodified

### Observability Guarantees

- Job execution metrics reflect replayed jobs as normal executions
- DLQ metrics remain historical and append-only
- Logs clearly distinguish replayed jobs via lineage metadata

### Phase 8 Outcome

The system now guarantees:

- Safe recovery from terminal job failures
- Clear separation between retry and replay semantics
- Full auditability of failures and all recovery attempts
- No hidden or automatic execution paths

---

## Phase 9 — Horizontal Scaling & Worker Concurrency

Phase 9 introduced horizontal and vertical scaling to validate the system under concurrent load and verify that all correctness guarantees hold at scale.

### Horizontal Scaling (Multiple Workers)

Multiple worker processes run simultaneously, all consuming from the same queue. BullMQ uses Redis-based locking to ensure exclusive job processing — each job attempt is processed by exactly one worker at a time.

**Properties validated:**

- Jobs are distributed across workers
- A single job is processed by only one worker at a time
- Retries may be handled by different workers
- DLQ behavior remains correct under concurrent failures
- No duplicate side effects occurred

### Vertical Scaling (Per-Worker Concurrency)

Worker concurrency is configurable, allowing a single worker process to process multiple jobs in parallel:

```
Total parallel jobs = number of workers × concurrency per worker
```

Throughput improvements are near-linear for I/O-bound workloads.

### Retry Distribution Behavior

Under concurrent load, a job's retry attempts may be executed by different workers — worker affinity is not enforced. This behavior is expected and desirable in distributed queue systems.

### Observability Under Scale

Each worker exposes its own `/metrics` endpoint on a separate port. Metrics are process-local and aggregation-ready for external monitoring tools such as Prometheus.

### Phase 9 Outcome

The system now supports:

- Multi-process distributed execution
- Per-worker concurrency scaling
- Safe retry handling across workers
- Correct DLQ behavior under concurrent load
- Observable metrics per worker instance
- Verified throughput improvements

Phase 9 transitions the system from a single-node job processor to a scalable distributed worker cluster.

---

## Phase 10 — Multi-Queue Workload Isolation

Phase 10 introduced queue isolation to separate heterogeneous workloads into independent processing lanes, preventing noisy-neighbor effects.

### Motivation

In earlier phases, all job types shared a single queue. This created operational limitations:

- Heavy jobs could delay lightweight jobs
- Concurrency tuning applied globally
- Backpressure from one workload affected all others

### Multi-Queue Architecture

The system now maintains multiple BullMQ queues, each backed by Redis with independent FIFO ordering and a dedicated Worker instance:

| Queue | Job Type | Weight |
|---|---|---|
| `email-queue` | `welcome-email` | Medium |
| `report-queue` | `generate-report` | Heavy |
| `cleanup-queue` | `cleanup-temp` | Light |

Job types are mapped to queues centrally via a **queue registry**. Unsupported job types are rejected at API validation time.

### Isolation Guarantees

- Heavy report jobs cannot delay email jobs
- Cleanup tasks do not block other workloads
- Retry storms remain confined to a single queue
- DLQ behavior is correct and scoped per job type
- Metrics remain labeled per job type

Isolation occurs at the Redis queue level, not at the worker process level.

### Scaling Model

```
Total parallel jobs = sum of (per-queue concurrency × number of worker processes)
```

Example: 2 workers × (3 + 2 + 1 concurrency) = **12 parallel jobs**

### Phase 10 Outcome

The system transitions from a monolithic queue processor to a **workload-aware distributed job platform**.

---

## Phase 11 — Graceful Shutdown & Lifecycle Safety

Phase 11 introduced graceful shutdown handling to ensure safe worker termination during process interrupts, container restarts, and deployment rollouts.

### Problem Addressed

Without graceful shutdown, active jobs could be interrupted mid-execution, side effects could remain partially applied, Redis connections could close abruptly, and metrics servers could leak open ports.

### Shutdown Strategy

The worker listens for `SIGTERM` (container orchestration) and `SIGINT` (manual interrupt). On receiving either signal:

1. Stop fetching new jobs
2. Allow all active jobs to complete
3. Close all BullMQ worker instances
4. Close the metrics HTTP server
5. Close the Redis connection
6. Exit cleanly

### Key Properties

- `worker.close()` ensures no new jobs are pulled, in-progress jobs are allowed to finish, and locks are released safely
- No job is ever abandoned mid-execution
- Because side effects are protected via `SET NX`, interrupted executions do not duplicate side effects — shutdown does not compromise idempotency guarantees

### Shutdown Observability

Structured shutdown events are emitted:

- `worker.shutdown_initiated`
- `worker.shutdown_complete`
- `worker.shutdown_error` (if any)

### Phase 11 Outcome

The system guarantees:

- No partial job execution during shutdown
- No side-effect duplication during interrupts
- Clean Redis and metrics server disconnection
- Deterministic process termination

Phase 11 transitions the worker from development-safe to **production-safe lifecycle management**.

---

## Phase 12 — Queue Depth Metrics & Backpressure Awareness

Phase 12 introduced queue depth monitoring to provide real-time visibility into workload pressure and backlog growth.

### Problem Addressed

Before Phase 12, the system tracked job counts, failures, latency, and DLQ events — but had no visibility into queue buildup. This made it impossible to detect backlog growth, identify under-provisioned queues, or make data-driven scaling decisions.

### Metrics Introduced

For each queue, three metrics are exposed (all labeled by queue name):

| Metric | Description |
|---|---|
| `queue_waiting_jobs` | Jobs queued but not yet processing |
| `queue_active_jobs` | Jobs currently in-flight |
| `queue_delayed_jobs` | Jobs pending retry (in backoff delay) |

**Example output:**

```
queue_waiting_jobs{queue="report-queue"} 8
queue_active_jobs{queue="report-queue"} 2
queue_delayed_jobs{queue="report-queue"} 0
queue_waiting_jobs{queue="email-queue"} 0
```

This immediately reveals report queue pressure while email queue remains clear — validating the isolation introduced in Phase 10.

### Collection Strategy

- Queue counts are polled at a fixed 5-second interval using non-blocking async calls
- Metrics polling is cleared during graceful shutdown
- Redis load impact is minimal and controlled
- Worker processing is never affected by metrics collection

### Phase 12 Outcome

The system transitions from reactive scaling to **observable, data-driven scaling** — with informed decisions based on per-queue backlog, active concurrency, latency trends, and failure rates.

---

## Phase 13 — Per-Queue Rate Limiting & Throughput Control

Phase 13 introduced rate limiting at the worker level to control job execution velocity and protect downstream dependencies from overload.

### Problem Addressed

Concurrency limits control how many jobs run simultaneously, but they do not restrict how frequently new jobs begin execution. Without rate limiting, horizontally scaled workers can overwhelm external services such as email providers, databases, and third-party APIs.

### Concurrency vs Rate Limiting

| Dimension | Mechanism |
|---|---|
| Maximum simultaneous jobs | Concurrency limit |
| Maximum jobs started per time window | Rate limit |

Both mechanisms work together to shape workload execution safely.

### Rate Limiting Model

Rate limiting is configured per queue using BullMQ's native limiter:

| Queue | Rate Limit |
|---|---|
| `email-queue` | 5 jobs/sec |
| `report-queue` | 2 jobs/sec |
| `cleanup-queue` | 1 job/sec |

Because queues are isolated (Phase 10), rate limits apply independently — heavy workloads cannot throttle unrelated queues.

### Phase 13 Outcome

The system now supports safe, scalable, and **controlled distributed job execution** aligned with production-grade system design principles.

---

## Phase 14 — Operational Dashboard (BullBoard)

Phase 14 introduced a centralized operational dashboard to provide real-time inspection and management of all job queues. As the system grew in complexity, reliance on logs and Redis CLI became insufficient.

### Architectural Integration

BullBoard is mounted directly into the existing Express API server:

- Mounted at `/admin/queues`
- Uses `ExpressAdapter` and `BullMQAdapter`
- Dynamically maps queues from the central `queueRegistry`, including the DLQ
- Minimal overhead when new queues are added

Because BullBoard connects directly to Redis, it reflects the global state of all workers regardless of deployment topology.

### Operational Capabilities

**Real-time inspection:**
- View job payloads and state transitions
- Inspect failure reasons and stack traces
- Monitor retry attempts

**Manual intervention:**
- Retry failed jobs
- Remove poison-pill jobs
- Clean queue states
- Inspect DLQ entries

---

## Phase 14.1 — Secured Dashboard

Phase 14.1 secures the BullBoard dashboard with Basic Authentication middleware, preventing unauthorized access to management operations.

### Security Controls

- Route protection via `basicAuth` middleware
- Credentials defined via environment variables (`ADMIN_USER`, `ADMIN_PASSWORD`)
- No hardcoded secrets
- Unauthorized access returns `HTTP 401`

### Why Security Matters

Without authentication, BullBoard's ability to retry, delete, and clean jobs represents a critical operational vulnerability.

### Phase 14 Outcome

The system now includes both **programmatic and authenticated human-operable observability layers**. This transitions the system from a backend job processor to an operationally manageable distributed platform.

---

## Phase 15 — Payload Validation & Boundary Hardening

Phase 15 formalized the API boundary by introducing **Zod schema-based payload validation**, replacing manual conditional checks with structured domain enforcement.

### Architectural Motivation

Distributed systems must protect internal components from untrusted input. Without strict boundary validation, invalid jobs enter Redis, workers process malformed data, the DLQ fills with user errors, and observability signals become polluted.

Phase 15 establishes a clear trust boundary at the API layer.

### Design Principles

- Validation occurs **before** enqueue — only valid domain objects enter Redis
- Each job type has a dedicated Zod schema
- Validation is centralized in `jobSchemas.js` and extensible
- Invalid requests are rejected with `400 Bad Request`
- Worker logic assumes validated payloads

### Domain Enforcement

Schemas enforce:

- Required fields per job type
- Correct data types
- Email format validation
- Optional test flags (e.g. `forceFail`)

This formalizes domain contracts between producers and consumers.

### System Impact

| Before Phase 15 | After Phase 15 |
|---|---|
| Invalid jobs enter Redis | Only validated objects enter Redis |
| Workers process malformed data | Workers process trusted payloads |
| DLQ contains user errors | DLQ reflects true runtime failures |
| Metrics are polluted | Metrics represent actual behavior |

Phase 15 marks the transition from basic validation to **structured boundary protection**.

---

## Phase 16 — Dockerised Deployment

Phase 16 introduced containerisation using Docker, transforming the system from a local development setup into a **reproducible, environment-independent deployment**.

### Architectural Motivation

Prior to this phase, the system relied on local Node.js execution, external Redis setup, and environment-specific configuration — making consistent deployment across environments difficult.

### System Topology

```
API Container
     │
     ▼
Redis Container
     │
     ▼
Worker Container(s)
```

Each component runs in isolation and communicates over a shared Docker network. Redis is reachable at `redis://redis:6379` within the network.

### Key Changes

- `Dockerfile` for the Node.js application
- `docker-compose.yml` for multi-service orchestration
- `.dockerignore` to optimise build context
- `REDIS_URL` externalised for environment-specific configuration
- Service discovery via Docker network hostnames

### Horizontal Scaling

```bash
docker compose up --scale worker=3
```

This enables parallel job processing, load distribution across workers, and realistic local simulation of distributed system behavior.

### Phase 16 Outcome

Phase 16 marks the transition from a development system to a **deployable architecture** — with environment consistency, simplified onboarding, and a foundation for CI/CD pipelines.

---

## Phase 17 — Continuous Integration

Phase 17 introduced a CI pipeline using GitHub Actions to automatically validate the system on every push and pull request.

### Architectural Motivation

Prior to this phase, system validation was entirely manual (Postman, logs). This made the system prone to unnoticed regressions, broken deployments, and environment inconsistencies.

### CI Workflow

```
GitHub Actions Runner
        ↓
Checkout Repository
        ↓
Build Docker Images
        ↓
Start Services (API + Worker + Redis)
        ↓
Run Integration Tests
        ↓
Pass / Fail
```

### Validation Strategy

The CI pipeline follows a **black-box integration testing model** — tests interact only via API endpoints and do not depend on internal implementation details. This ensures stability during internal refactoring.

| Check | Description |
|---|---|
| System startup | Docker containers build and services start without errors |
| API availability | Health endpoint responds successfully |
| Job submission | Valid jobs are accepted (`202 Accepted`) |
| Worker stability | Jobs are processed without runtime failures |
| Job lifecycle | Jobs transition `waiting → active → completed` |
| Idempotency | Duplicate requests return the same job ID |
| Retry handling | Failed jobs are retried and reach terminal `failed` state |
| DLQ isolation | Permanently failed jobs are isolated in the DLQ |
| DLQ retrieval | DLQ jobs are accessible via `GET /jobs/dlq` |
| DLQ replay | Jobs can be replayed with lineage metadata preserved |

### Phase 17 Outcome

The system now has:

- Automated regression detection on every push
- Reproducible testing environments via Docker
- Confidence in code changes before deployment
- A foundation for advanced testing (load testing, retry verification, performance benchmarks)

## Phase 18 — Post-CI System Enhancements

After achieving stable CI validation, the system was extended to improve reliability, control, and observability.

### Dead Letter Queue (DLQ)
- Implemented API access to DLQ (`GET /jobs/dlq`)
- Enabled inspection of failed jobs and metadata

### DLQ Replay
- Added replay endpoint (`POST /jobs/dlq/:id/replay`)
- Introduced:
  - replay count tracking
  - replay limit enforcement (max 3)
  - payload sanitization to prevent infinite failure loops

### Concurrency Control
- Configured per-queue worker concurrency
- Ensured bounded parallel execution and system stability

### Rate Limiting
- Applied BullMQ limiter at queue level
- Controlled job throughput under burst load conditions

### Load Testing
- Simulated high-throughput job submission using parallel requests
- Verified system behavior under concurrency and rate limits

### Priority Queues
- Introduced priority-based scheduling (lower value = higher priority)
- Verified that high-priority jobs are processed ahead of lower-priority jobs in waiting state

### Observability
- Enhanced logging with priority and execution tagging
- Improved debugging and traceability of job execution order

---

