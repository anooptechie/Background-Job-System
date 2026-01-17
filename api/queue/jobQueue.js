const { Queue } = require("bullmq");
const connection = require("../../shared/redis");

const jobQueue = new Queue("jobs-queue", {
  connection,
});

module.exports = jobQueue;
