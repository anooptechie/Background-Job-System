const { Worker } = require("bullmq");
const connection = require("../shared/redis");

console.log("🚀 Worker process started");

connection.on("connect", () => {
  console.log("👷 Worker connected to Redis");
});

connection.on("error", (err) => {
  console.error("❌ Worker Redis Error:", err.message);
});
const worker = new Worker(
  "jobs-queue",
  async (job) => {
    console.log("Processing Jobs");
    console.log("Jobs ID:", job.id);
    console.log("Job Type", job.name);
    console.log("Job Data", job.data);

    // 🔴 Test 4.1 – intentional failure to test retry
    // if (job.data?.forceFail === true) {
    //   console.log("⚠️ Forcing job failure for retry test:", job.id);
    //   throw new Error("Intentional failure for retry test");
    // }

    const sideEffectKey = `side-effect:${job.id}`;

    // Reserve side effect execution (atomic)
    const reserved = await connection.set(sideEffectKey, "in-progress", "NX");

    if (!reserved) {
      console.log("Side effect already reserved/executed, skipping:", job.id);

      console.log("Job Completed Safely (recovered)", job.id);
      return;
    }

    // 🔹 SIDE EFFECT
    console.log("Sending welcome email to:", job.data.email);

    // 🔴 Test 4.2 – At-Most-Once Side Effects
    // if (job.data?.crashAfterSideEffect === true) {
    //   console.log("💥 Crashing AFTER side effect for test:", job.id);
    //   throw new Error("Crash after side effect");
    // }

    //throwing error before side effect returns "done"
    // throw new Error("Crash after side effect");

    // simulate async work
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mark side effect as completed
    await connection.set(sideEffectKey, "done");

    console.log("Job Completed Safely", job.id);
  },
  { connection },
);

worker.on("failed", (job, err) => {
  console.error("Job failed", job.id, err.message);
});

// 🔴 Phase 3.1: intentional failure
// if (job.name === "welcome-email") {
//   throw new Error("Simulated email service failure");
// }
