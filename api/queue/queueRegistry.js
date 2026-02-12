const { Queue } = require("bullmq");
const connection = require("../../shared/redis");

// Centralized queue definitions
const queues = {
  email: new Queue("email-queue", { connection }),
  report: new Queue("report-queue", { connection }),
  cleanup: new Queue("cleanup-queue", { connection }),
};

function getQueueByType(type) {
  switch (type) {
    case "welcome-email":
      return queues.email;

    case "generate-report":
      return queues.report;

    case "cleanup-temp":
      return queues.cleanup;

    default:
      throw new Error(`Unsupported job type: ${type}`);
  }
}

module.exports = {
  queues,
  getQueueByType,
};
