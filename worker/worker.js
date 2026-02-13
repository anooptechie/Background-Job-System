const { Worker } = require("bullmq");
const connection = require("../shared/redis");
const logger = require("../shared/logger");
const {
  jobCounter,
  jobDuration,
  dlqCounter,
  queueWaitingGauge,
  queueActiveGauge,
  queueDelayedGauge,
  dlqSizeGauge, // ✅ FIXED: Added missing import
} = require("../shared/metrics");
const deadLetterQueue = require("../api/queue/deadLetterQueue");
const { queues } = require("../api/queue/queueRegistry");

const http = require("http");
const { client } = require("../shared/metrics");

logger.info("worker.started");

/* =============================
   Redis Observability
============================= */

connection.on("connect", () => {
  logger.info("worker.redis.connected");
});

connection.on("error", (err) => {
  logger.error({ err: err.message }, "worker.redis.error");
});

/* =============================
   Metrics Server
============================= */

const METRICS_PORT = process.env.WORKER_METRICS_PORT || 3001;

const metricsServer = http.createServer(async (req, res) => {
  if (req.url === "/metrics") {
    try {
      res.writeHead(200, {
        "Content-Type": client.register.contentType,
      });
      res.end(await client.register.metrics());
    } catch (err) {
      res.writeHead(500);
      res.end(err.message);
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

metricsServer.listen(METRICS_PORT, () => {
  logger.info({ port: METRICS_PORT }, "worker.metrics_server.started");
});

/* =============================
   Shared Job Processor
============================= */

async function processJob(job) {
  const startTime = Date.now();

  logger.info({ jobId: job.id, jobType: job.name }, "job.started");

  if (job.data?.forceFail === true) {
    logger.warn({ jobId: job.id }, "job.forced_failure");
    throw new Error("Intentional failure");
  }

  const sideEffectKey = `side-effect:${job.id}`;
  const reserved = await connection.set(sideEffectKey, "in-progress", "NX");

  if (!reserved) {
    logger.warn({ jobId: job.id }, "job.side_effect_already_executed");

    jobCounter.inc({ status: "success", type: job.name });
    jobDuration.observe({ type: job.name }, Date.now() - startTime);

    logger.info({ jobId: job.id }, "job.completed_recovered");
    return;
  }

  logger.info({ jobId: job.id }, "job.side_effect_started");

  if (job.name === "welcome-email") {
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (job.name === "generate-report") {
    await new Promise((r) => setTimeout(r, 4000));
  }

  if (job.name === "cleanup-temp") {
    await new Promise((r) => setTimeout(r, 1000));
  }

  await connection.set(sideEffectKey, "done");

  jobCounter.inc({ status: "success", type: job.name });
  jobDuration.observe({ type: job.name }, Date.now() - startTime);

  logger.info({ jobId: job.id }, "job.completed");
}

/* =============================
   Phase 13 — Concurrency + Rate Limiting
============================= */

const queueConfig = {
  "email-queue": {
    concurrency: 3,
    limiter: { max: 5, duration: 1000 },
  },
  "report-queue": {
    concurrency: 2,
    limiter: { max: 2, duration: 1000 },
  },
  "cleanup-queue": {
    concurrency: 1,
    limiter: { max: 1, duration: 1000 },
  },
};

const workers = [];

Object.values(queues).forEach((queue) => {
  const config = queueConfig[queue.name] || {
    concurrency: 1,
    limiter: { max: 1, duration: 1000 },
  };

  const worker = new Worker(queue.name, processJob, {
    connection,
    concurrency: config.concurrency,
    limiter: config.limiter,
  });

  workers.push(worker);

  logger.info(
    {
      queue: queue.name,
      concurrency: config.concurrency,
      limiter: config.limiter,
    },
    "worker.queue_started",
  );

  worker.on("failed", async (job, err) => {
    jobCounter.inc({ status: "failed", type: job.name });

    logger.error({ jobId: job.id, err: err.message }, "job.failed");

    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts || 3;

    if (attemptsMade < maxAttempts) return;

    await deadLetterQueue.add("dead-job", {
      originalJobId: job.id,
      jobType: job.name,
      payload: job.data,
      failedReason: err.message,
      attemptsMade,
      failedAt: new Date().toISOString(),
    });

    dlqCounter.inc({ type: job.name });

    logger.error({ jobId: job.id, attemptsMade }, "job.moved_to_dlq");
  });
});

/* =============================
   Phase 12 — Queue Depth Polling
============================= */

const QUEUE_METRICS_INTERVAL = 5000;

const metricsInterval = setInterval(async () => {
  try {
    await Promise.all(
      Object.values(queues).map(async (queue) => {
        const [waiting, active, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getDelayedCount(),
        ]);

        queueWaitingGauge.set({ queue: queue.name }, waiting);
        queueActiveGauge.set({ queue: queue.name }, active);
        queueDelayedGauge.set({ queue: queue.name }, delayed);
      }),
    );

    //This will now work because dlqSizeGauge is imported
    const dlqCount = await deadLetterQueue.getWaitingCount();
    dlqSizeGauge.set(dlqCount);
    
  } catch (err) {
    logger.error({ err: err.message }, "queue.metrics_collection_failed");
  }
}, QUEUE_METRICS_INTERVAL);

/* =============================
   Graceful Shutdown
============================= */

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "worker.shutdown_initiated");

  try {
    clearInterval(metricsInterval);

    await Promise.all(workers.map((worker) => worker.close()));

    await new Promise((resolve) => metricsServer.close(resolve));

    await connection.quit();

    logger.info("worker.shutdown_complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message }, "worker.shutdown_error");
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));