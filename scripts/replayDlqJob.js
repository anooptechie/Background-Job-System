const { Queue } = require("bullmq");
const deadLetterQueue = require("../api/queue/deadLetterQueue");
const connection = require("../shared/redis");

const jobsQueue = new Queue("jobs-queue", { connection });

async function replayDlqJob() {
  const dlqJobId = process.argv[2];

  if (!dlqJobId) {
    console.error("❌ DLQ job ID is required");
    console.error("Usage: node scripts/replayDlqJob.js <dlqJobId>");
    process.exit(1);
  }

  const dlqJob = await deadLetterQueue.getJob(dlqJobId);

  if (!dlqJob) {
    console.error(`❌ No DLQ job found with ID ${dlqJobId}`);
    process.exit(1);
  }

  const { jobType, payload, originalJobId, attemptsMade, failedReason } =
    dlqJob.data;

  console.log("🔁 Replaying DLQ job");
  console.log("DLQ Job ID:", dlqJob.id);
  console.log("Original Job ID:", originalJobId);
  console.log("Job Type:", jobType);
  console.log("Attempts Made:", attemptsMade);
  console.log("Failure Reason:", failedReason);

  const newJob = await jobsQueue.add(
    jobType,
    {
      ...payload,
      replayedFromJobId: originalJobId,
      replayedAt: new Date().toISOString(),
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  );

  console.log("✅ Replay successful");
  console.log("New Job ID:", newJob.id);
  console.log("Replayed From:", originalJobId);

  process.exit(0);
}

replayDlqJob().catch((err) => {
  console.error("❌ Replay failed:", err);
  process.exit(1);
});
