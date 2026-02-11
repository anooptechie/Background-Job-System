# Phase 6 – Observability Test Runbook

This document captures the **exact steps used to verify Phase 6 (Observability & Monitoring)** for the background job processing system.

The goal of these tests is to **prove**, not assume, that logs and metrics accurately reflect system behavior under success, failure, retries, and recovery.

---

## Prerequisites

Before running these tests, ensure:

- Redis is running and reachable
- Environment variables are configured (`REDIS_URL`, optional `WORKER_METRICS_PORT`)
- Phase 6 code is present:
  - Structured logging in the worker
  - Metrics instrumentation (`jobs_total`, `job_duration_ms`)
  - Metrics endpoints exposed by API and worker

---

## 1. Start the System

Start API and worker processes together:

```bash
npm run dev
```

Expected startup signals:
- Worker logs `worker.started`
- Worker logs Redis connection success
- API starts on port `3000`
- Worker metrics server starts (default port `3001`)

---

## 2. Verify Metrics Endpoints (Cold State)

### API Metrics

Open:
```
http://localhost:3000/metrics
```

Expected:
- Process-level metrics only (CPU, memory)
- No job-related metrics yet

This confirms the API metrics endpoint is wired correctly.

---

### Worker Metrics

Open:
```
http://localhost:3001/metrics
```

Expected:
- Process-level metrics only
- No `jobs_total` or histogram buckets yet

Reason:
- Prometheus counters and histograms appear only after first observation.

---

## 3. Test Successful Job Execution Metrics

### Submit a Successful Job

Send a job using the API:

```json
{
  "type": "welcome-email",
  "idempotencyKey": "phase6-success-1",
  "payload": {
    "email": "success@example.com",
    "name": "Observability"
  }
}
```

---

### Verify Worker Logs

Expected log sequence (order may vary slightly due to async execution):

- `job.started`
- `job.side_effect_started`
- `job.completed`

Each log entry must include the same `jobId`.

---

### Verify Worker Metrics

Refresh:
```
http://localhost:3001/metrics
```

Expected:

- Success counter incremented:
  ```
  jobs_total{status="success",type="welcome-email"} 1
  ```

- Histogram buckets populated:
  ```
  job_duration_ms_bucket{le="5000",type="welcome-email"} 1
  job_duration_ms_sum{type="welcome-email"} <value>
  job_duration_ms_count{type="welcome-email"} 1
  ```

This confirms successful execution is correctly observed.

---

## 4. Test Failure Metrics (Controlled Failure)

### Enable Forced Failure

Temporarily enable a forced failure condition in the worker:

```js
if (job.data?.forceFail === true) {
  throw new Error("Intentional failure for metrics test");
}
```

Restart **only the worker** after this change.

---

### Submit a Failing Job

```json
{
  "type": "welcome-email",
  "idempotencyKey": "phase6-failure-1",
  "payload": {
    "email": "fail@example.com",
    "forceFail": true
  }
}
```

---

### Verify Failure Logs

Expected worker logs:

- `job.started`
- `job.failed`

If retries are enabled, `job.failed` may appear multiple times for the same `jobId`.

---

### Verify Failure Metrics

Refresh worker metrics:
```
http://localhost:3001/metrics
```

Expected:

```text
jobs_total{status="failed",type="welcome-email"} <N>
```

Where `<N>` equals the number of failed execution attempts (including retries).

Important:
- Metrics count **execution attempts**, not unique jobs.

---

### Verify No Latency Metrics for Failures

Expected:
- No new histogram buckets added for failed executions

Reason:
- Latency histograms intentionally record **successful executions only** to avoid skewed performance signals.

---

## 5. Test Retry and Recovery Observability (Optional)

### Enable Crash-After-Side-Effect Test

Enable:

```js
if (job.data?.crashAfterSideEffect === true) {
  throw new Error("Crash after side effect");
}
```

Restart worker.

---

### Submit Recovery Test Job

```json
{
  "type": "welcome-email",
  "idempotencyKey": "phase6-recovery-1",
  "payload": {
    "email": "recover@example.com",
    "crashAfterSideEffect": true
  }
}
```

---

### Verify Logs

Expected behavior:

- First attempt fails after side effect
- Retry skips side effect
- Job completes successfully

Logs will include:
- `job.side_effect_started`
- `job.failed`
- `job.side_effect_already_executed`
- `job.completed_recovered`

---

### Verify Metrics

Expected metrics changes:

- Failure counter increments by 1
- Success counter increments by 1
- Latency histogram records one successful execution

This confirms observability correctly captures retries and recovery.

---

## 6. Cleanup

After testing:

- Re-disable forced failure and crash test code
- Restart worker

System returns to normal operation with observability intact.

---

## Outcome

After completing this runbook, Phase 6 is considered **fully verified**.

The system can now reliably:

- Correlate job execution via logs
- Measure success and failure rates
- Observe retry behavior honestly
- Analyze job latency using distributions

This observability foundation enables safe progression to DLQs, scaling, and alerting in future phases.

7. Dead Letter Queue (DLQ) Verification

This section verifies Phase 7 – Explicit Dead Letter Queue (DLQ) behavior.

The goal is to prove that only terminally failed jobs are moved to the DLQ, retries are respected, and normal job processing remains unaffected.

7.1 Test: Job Retries Do NOT Enter DLQ

Configure a job with retries (e.g. attempts: 3).

Enable a forced failure in the worker:

if (job.data?.forceFail === true) {
  throw new Error("Intentional failure");
}

Submit a job that fails on execution.

Expected behavior:

Job fails and retries automatically

Worker logs multiple job.failed events

No job.moved_to_dlq log appears

dlq_jobs_total metric does not increment

This confirms that retrying jobs are not considered dead.

7.2 Test: Terminal Failure Moves Job to DLQ

Submit a job that always fails and exhausts all retries.

Observe worker logs.

Expected log sequence:

Multiple job.failed events

Exactly one job.moved_to_dlq event after final retry

Expected metrics:

dlq_jobs_total{type="<job-type>"} +1

This confirms that jobs are moved to the DLQ once and only once after retries are exhausted.

7.3 Inspect DLQ Contents

Run the DLQ inspection script:

node scripts/inspectDlq.js

Expected output:

DLQ job has its own DLQ-scoped ID

Original job ID is preserved

Job payload and failure reason are retained

This confirms that the DLQ acts as a durable audit record.

7.4 Verify DLQ Isolation

After a job enters the DLQ, submit a healthy job.

Expected behavior:

Healthy job processes successfully

DLQ contents remain unchanged

Worker remains stable

This confirms that DLQ jobs do not block or interfere with normal processing.

7.5 Verify DLQ Metrics

Open the worker metrics endpoint:

http://localhost:3001/metrics

Expected metrics:

dlq_jobs_total{type="<job-type>"} <count>

Relationship to other metrics:

jobs_total{status="failed"} counts execution attempts

dlq_jobs_total counts terminal job failures

This separation ensures retries and permanent failures are observable independently.

Outcome

After completing Phase 7 verification, the system guarantees:

Clear separation between transient failures and terminal failures

Safe isolation of permanently failed jobs

Durable, inspectable DLQ records

Accurate metrics for both retries and dead-lettered jobs

With Phase 7 complete, the system now supports failure isolation and operational clarity, enabling safe replay, alerting, and scaling in future phases.

8. DLQ Replay Verification

This section verifies Phase 8 – DLQ Replay Semantics.

Replay is a manual, explicit operation that creates a new job from a DLQ entry after the underlying failure cause has been addressed.

8.1 Inspect DLQ and Select a Job to Replay

List DLQ jobs:

node scripts/inspectDlq.js

Identify the DLQ Job ID to replay.

Important:

Replay uses DLQ Job ID, not the original job ID

DLQ job IDs are scoped to the dead-letter queue

8.2 Replay a DLQ Job

Run the replay script with the DLQ job ID:

node scripts/replayDlqJob.js <dlqJobId>

Expected output:

DLQ job metadata is printed

A new job ID is created in jobs-queue

Lineage is preserved via replayedFromJobId

8.3 Verify Replay Execution

Observe worker logs for the replayed job:

Expected log sequence:

job.started

job.side_effect_started

job.completed

If the underlying issue is unresolved, the replayed job may fail again and re-enter the DLQ as a new DLQ entry.

8.4 Verify Replay Safety Guarantees

Confirm the following properties:

Replay creates a new job ID

Original DLQ entry remains unchanged

Replay does not bypass retries or idempotency

No automatic replay loops exist

This confirms replay is safe, explicit, and auditable.

Outcome

After completing Phases 7 and 8 verification, the system guarantees:

Clear separation between transient failures and terminal failures

Durable isolation of permanently failed jobs

Safe, manual replay of DLQ entries

Full observability across retries, DLQ, and replay lifecycle

With DLQ and replay semantics in place, the system is now ready for horizontal scaling, queue isolation, and alerting.

Phase 9 Testing Process

You tested two things:

Horizontal scaling (multiple workers)

Vertical scaling (concurrency inside worker)

Here’s the clean testing process.

🔹 Test A — Baseline (Concurrency = 1)
Setup

1 worker

concurrency not set (default = 1)

Each job simulates ~2 seconds of async work

Command
npm run dev:server
WORKER_METRICS_PORT=3001 npm run dev:worker

Submit

Send 6 jobs quickly.

Expected Behavior

Jobs execute strictly one after another

Logs look sequential:

job A started
job A completed
job B started
job B completed
...

Measure

If each job ≈ 2 seconds:

6 jobs × 2 seconds = ~12 seconds total

Throughput
6 / 12 = 0.5 jobs/sec

🔹 Test B — Horizontal Scaling (Multiple Workers, Concurrency = 1)
Setup

3 workers

No concurrency setting

npm run dev:server
WORKER_METRICS_PORT=3001 npm run dev:worker
WORKER_METRICS_PORT=3002 npm run dev:worker
WORKER_METRICS_PORT=3003 npm run dev:worker

Submit

Send 6 jobs quickly.

Expected Behavior

Jobs distributed across workers

Different job IDs appear in different terminals

No duplicate execution

Retries may occur on different workers

Estimated Time

With 3 workers:

6 jobs / 3 workers ≈ 2 batches
2 batches × 2 seconds ≈ 4 seconds


Throughput roughly tripled.

🔹 Test C — Vertical Scaling (Concurrency = 3)

Modify worker:

{
  connection,
  concurrency: 3
}


Restart workers.

Setup Example

2 workers × concurrency 3

Total parallel jobs possible = 6

Submit

Send 6 jobs quickly.

Expected Behavior

Inside the SAME worker terminal:

job A started
job B started
job C started


Immediately.

After ~2 seconds:

job A completed
job B completed
job C completed


Then next batch.

Estimated Time
6 jobs ≈ ~4 seconds


Throughput significantly improved compared to baseline.

🔎 Important Validations Performed

During all tests you confirmed:

No two workers processed same job simultaneously

Retry attempts could move across workers

DLQ behavior unchanged

Idempotency safeguards still prevented duplicate side effects

Metrics remained process-local

That’s real distributed validation.

What Phase 9 Proved

Before Phase 9:

Single-worker safe

After Phase 9:

Multi-process safe

Concurrent safe

Retry safe under distribution

Throughput scalable

That’s a big architectural leap.