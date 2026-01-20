require("dotenv").config();
const { addJob } = require("../api/queue/jobQueue");

async function run() {
  console.log("System Producer Started");

  await addJob(
    "welcome-email",
    {
      email: "system@example.com",
      name: "System",
      message: "This job was created without any HTTP Request",
    },
    `system:welcome-email:startup-${Date.now()}`,
  );

  console.log("System Job enqueued successfully");
  process.exit(0);
}

run().catch((err) => {
  console.log("System Producer failed", err.message);
  process.exit(1);
});

//function call and attaching catch block