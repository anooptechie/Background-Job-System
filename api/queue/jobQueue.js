const { Queue } = require("bullmq");
const connection = require("../../shared/redis");

const jobQueue = new Queue("jobs-queue", {
  connection,
});

//
async function addJob(type, payload) {
  const job = await jobQueue.add(type, payload);
  return job;
}

async function getJobById(jobId) {
  const job = await jobQueue.getJob(jobId);
  return job;
}

module.exports = { jobQueue, addJob, getJobById };
