const { Queue } = require("bullmq");
const connection = require("../../shared/redis");

const deadLetterQueue = new Queue("dead-letter-queue", {
  connection,
});

module.exports = deadLetterQueue;
