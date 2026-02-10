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

