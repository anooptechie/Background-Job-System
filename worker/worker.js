const { Worker } = require("bullmq");
const connection = require("../shared/redis");

const worker = new Worker(
  "jobs-queue",
  async (job) => {
    console.log("Processing Jobs");
    console.log("Jobs ID:", job.id);
    console.log("Job Type", job.name);
    console.log("Job Data", job.data);

    // 🔴 Phase 3.1: intentional failure
    if (job.name === "welcome-email") {
      throw new Error("Simulated email service failure");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("Job Completed", job.id);
  },
  { connection },
);

worker.on("failed", (job, err)=>{
    console.error("Job failed", job.id, err.message)
})