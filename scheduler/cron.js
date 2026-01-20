require("dotenv").config();

const { addJob } = require("../api/queue/jobQueue");

// Runs every 60 seconds
const INTERVAL_MS = 60 * 1000;

function getMinuteBucket() {
  return Math.floor(Date.now() / INTERVAL_MS);
}

async function runScheduledJob() {
  const bucket = getMinuteBucket();

  const idempotencyKey = `system:heartbeat:${bucket}`;

  console.log("⏰ Scheduler tick:", new Date().toISOString());

  try {
    await addJob(
      "welcome-email",
      {
        email: "cron@example.com",
        name: "Scheduler",
        message: "This job was triggered by the scheduler",
      },
      idempotencyKey
    );

    console.log("✅ Scheduled job enqueued for bucket:", bucket);
  } catch (err) {
    console.error("❌ Scheduler failed:", err.message);
  }
}

console.log("🕒 Scheduler started");

setInterval(runScheduledJob, INTERVAL_MS);
