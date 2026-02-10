const client = require("prom-client");

client.collectDefaultMetrics();

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

module.exports = {
  client,
  jobCounter,
  jobDuration,
};
