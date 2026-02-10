const { Queue } = require("bullmq");
const connection = require("../../shared/redis");
const crypto = require("crypto");

const jobQueue = new Queue("jobs-queue", {
  connection,
});

//hashing jobid
function toJobId(idempotencyKey) {
  return crypto
    .createHash("sha256")
    .update(String(idempotencyKey))
    .digest("hex");
}

async function addJob(type, payload, idempotencyKey) {
  if (!idempotencyKey) {
    throw new Error("idempotencyKey is required");
  }

  const jobId = toJobId(idempotencyKey);

  const job = await jobQueue.add(type, payload, {
    jobId, // hashed, Redis-safe, BullMQ-safe
    attempts: 3,
    backoff: { type: "fixed", delay: 10000 },
  });

  return job;
}

async function getJobById(jobId) {
  const job = await jobQueue.getJob(jobId);
  return job;
}

module.exports = { jobQueue, addJob, getJobById };
