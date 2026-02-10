const deadLetterQueue = require("../api/queue/deadLetterQueue");

async function inspectDLQ() {
  // Total number of jobs in DLQ
  const total = await deadLetterQueue.count();

  if (total === 0) {
    console.log("DLQ is empty ✅");
    process.exit(0);
  }

  // Fetch the MOST RECENT jobs (last 10)
  const start = Math.max(total - 10, 0);
  const end = total - 1;

  const jobs = await deadLetterQueue.getJobs(
    ["waiting", "delayed", "failed", "completed"],
    start,
    end,
  );

  console.log(`Found ${total} job(s) in DLQ`);
  console.log(`Showing latest ${jobs.length} job(s):\n`);

  for (const job of jobs.reverse()) {
    console.log("----- DLQ JOB -----");
    console.log("DLQ Job ID:", job.id);
    console.log("Original Job ID:", job.data.originalJobId);
    console.log("Job Type:", job.data.jobType);
    console.log("Attempts Made:", job.data.attemptsMade);
    console.log("Failed Reason:", job.data.failedReason);
    console.log("Failed At:", job.data.failedAt);
    console.log("Payload:", job.data.payload);
    console.log("-------------------\n");
  }

  process.exit(0);
}

inspectDLQ().catch((err) => {
  console.error("Failed to inspect DLQ:", err);
  process.exit(1);
});
