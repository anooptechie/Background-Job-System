const { Worker } = require("bullmq");
const connection = require("../shared/redis");
const logger = require("../shared/logger");
const { jobCounter, jobDuration } = require("../shared/metrics");
const http = require("http");
const { client } = require("../shared/metrics");


logger.info("worker.started");

connection.on("connect", () => {
  logger.info("worker.redis.connected");
});

connection.on("error", (err) => {
  logger.error({ err: err.message }, "worker.redis.error");
});

const METRICS_PORT = process.env.WORKER_METRICS_PORT || 3001;

http
  .createServer(async (req, res) => {
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
  })
  .listen(METRICS_PORT, () => {
    logger.info({ port: METRICS_PORT }, "worker.metrics_server.started");
  });

const worker = new Worker(
  "jobs-queue",
  async (job) => {
    const startTime = Date.now();

    logger.info(
      {
        jobId: job.id,
        jobType: job.name,
      },
      "job.started",
    );

    // 🔴 Test 4.1 – intentional failure to test retry
    if (job.data?.forceFail === true) {
      logger.warn(
        { jobId: job.id },
        "job.forced_failure_for_retry_test",
      );
      throw new Error("Intentional failure for retry test");
    }

    const sideEffectKey = `side-effect:${job.id}`;

    // Reserve side effect execution (atomic)
    const reserved = await connection.set(sideEffectKey, "in-progress", "NX");

    if (!reserved) {
      logger.warn({ jobId: job.id }, "job.side_effect_already_executed");

      // Record recovered completion
      try {
        jobCounter.inc({ status: "success", type: job.name });
        jobDuration.observe({ type: job.name }, Date.now() - startTime);
      } catch (err) {
        logger.error({ err: err.message }, "metrics.recording_failed");
      }

      logger.info({ jobId: job.id }, "job.completed_recovered");
      return;
    }

    // 🔹 SIDE EFFECT
    logger.info({ jobId: job.id }, "job.side_effect_started");

    // 🔴 Test 4.2 – At-Most-Once Side Effects
    // if (job.data?.crashAfterSideEffect === true) {
    //   logger.error(
    //     { jobId: job.id },
    //     "job.crash_after_side_effect_test",
    //   );
    //   throw new Error("Crash after side effect");
    // }

    // simulate async work
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mark side effect as completed
    await connection.set(sideEffectKey, "done");

    // Record success metrics
    try {
      jobCounter.inc({ status: "success", type: job.name });
      jobDuration.observe({ type: job.name }, Date.now() - startTime);
    } catch (err) {
      logger.error({ err: err.message }, "metrics.recording_failed");
    }

    logger.info({ jobId: job.id }, "job.completed");
  },
  { connection },
);

worker.on("failed", (job, err) => {
  // Record failure metric
  try {
    jobCounter.inc({ status: "failed", type: job.name });
  } catch (e) {
    logger.error({ err: e.message }, "metrics.recording_failed");
  }

  logger.error(
    {
      jobId: job.id,
      err: err.message,
    },
    "job.failed",
  );
});
