const { Queue } = require("bullmq");
const connection = require("../../shared/redis");

const jobQueue = new Queue("jobs-queue", {
  connection,
});

//
async function addJob(type, payload) {
  const job = await jobQueue.add(type, payload, {
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
