const client = require("prom-client");

client.collectDefaultMetrics();

/* =============================
   Existing Metrics
============================= */

const jobCounter = new client.Counter({
  name: "jobs_total",
  help: "Total jobs processed",
  labelNames: ["status", "type"],
});

const jobDuration = new client.Histogram({
  name: "job_duration_ms",
  help: "Job execution duration",
  labelNames: ["type"],
  buckets: [100, 500, 1000, 2000, 5000],
});

const dlqCounter = new client.Counter({
  name: "dlq_jobs_total",
  help: "Total jobs moved to dead letter queue",
  labelNames: ["type"],
});

const dlqSizeGauge = new client.Gauge({
  name: "queue_dead_letter_size",
  help: "Total number of jobs currently in the dead letter queue",
});

/* =============================
   Phase 12 — Queue Depth Metrics
============================= */

const queueWaitingGauge = new client.Gauge({
  name: "queue_waiting_jobs",
  help: "Number of waiting jobs per queue",
  labelNames: ["queue"],
});

const queueActiveGauge = new client.Gauge({
  name: "queue_active_jobs",
  help: "Number of active jobs per queue",
  labelNames: ["queue"],
});

const queueDelayedGauge = new client.Gauge({
  name: "queue_delayed_jobs",
  help: "Number of delayed jobs per queue",
  labelNames: ["queue"],
});

module.exports = {
  client,
  jobCounter,
  jobDuration,
  dlqCounter,
  dlqSizeGauge,
  queueWaitingGauge,
  queueActiveGauge,
  queueDelayedGauge,
};
