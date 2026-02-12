const crypto = require("crypto");
const { getQueueByType } = require("./queueRegistry");

// Hashing jobId from idempotencyKey (unchanged logic)
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

  const queue = getQueueByType(type);
  const jobId = toJobId(idempotencyKey);

  const job = await queue.add(type, payload, {
    jobId,
    attempts: 3,
    backoff: { type: "fixed", delay: 10000 },
  });

  return job;
}

async function getJobById(jobId) {
  // We must search across queues
  const { queues } = require("./queueRegistry");

  for (const queue of Object.values(queues)) {
    const job = await queue.getJob(jobId);
    if (job) return job;
  }

  return null;
}

module.exports = { addJob, getJobById };
