const { Worker } = require("bullmq");
const connection = require("../shared/redis");
const logger = require("../shared/logger");
const { jobCounter, jobDuration, dlqCounter } = require("../shared/metrics");
const deadLetterQueue = require("../api/queue/deadLetterQueue");
const { queues } = require("../api/queue/queueRegistry");

const http = require("http");
const { client } = require("../shared/metrics");

logger.info("worker.started");

/* =============================
   Redis Connection Observability
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

  logger.info(
    { jobId: job.id, jobType: job.name },
    "job.started"
  );

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
   Start Workers (Per Queue)
============================= */

const queueConcurrency = {
  "email-queue": 3,
  "report-queue": 2,
  "cleanup-queue": 1,
};

const workers = [];

Object.values(queues).forEach((queue) => {
  const worker = new Worker(
    queue.name,
    processJob,
    {
      connection,
      concurrency: queueConcurrency[queue.name] || 1,
    }
  );

  workers.push(worker);

  logger.info(
    { queue: queue.name, concurrency: queueConcurrency[queue.name] || 1 },
    "worker.queue_started"
  );

  worker.on("failed", async (job, err) => {
    jobCounter.inc({ status: "failed", type: job.name });

    logger.error(
      { jobId: job.id, err: err.message },
      "job.failed"
    );

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

    logger.error(
      { jobId: job.id, attemptsMade },
      "job.moved_to_dlq"
    );
  });
});

/* =============================
   Graceful Shutdown
============================= */

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "worker.shutdown_initiated");

  try {
    // Stop accepting new jobs and wait for active jobs to finish
    await Promise.all(workers.map((worker) => worker.close()));

    // Close metrics server
    await new Promise((resolve) =>
      metricsServer.close(resolve)
    );

    // Close Redis connection
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
