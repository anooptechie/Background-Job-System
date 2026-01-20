const { Worker } = require("bullmq");
const connection = require("../shared/redis");

const worker = new Worker(
  "jobs-queue",
  async (job) => {
    console.log("Processing Jobs");
    console.log("Jobs ID:", job.id);
    console.log("Job Type", job.name);
    console.log("Job Data", job.data);

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
