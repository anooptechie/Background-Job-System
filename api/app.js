const express = require("express");
const jobRoutes = require("./routes/jobRoutes");
const { client } = require("../shared/metrics");

// --- BullBoard Imports ---
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");

// Import your queues
const { queues } = require("./queue/queueRegistry");
const deadLetterQueue = require("./queue/deadLetterQueue");

const app = express();

/* =========================================
   🔐 Basic Auth Middleware (Phase 14.1)
========================================= */

function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.set("WWW-Authenticate", 'Basic realm="BullBoard"');
    return res.status(401).send("Authentication required.");
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("ascii");
  const [username, password] = credentials.split(":");

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="BullBoard"');
  return res.status(401).send("Invalid credentials.");
}

/* =========================================
   🖥 BullBoard Setup
========================================= */

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(queues.email),
    new BullMQAdapter(queues.report),
    new BullMQAdapter(queues.cleanup),
    new BullMQAdapter(deadLetterQueue),
  ],
  serverAdapter: serverAdapter,
});

// Parse JSON
app.use(express.json());

// API Routes
app.use("/jobs", jobRoutes);

// 🔐 Protect BullBoard UI
app.use("/admin/queues", basicAuth, serverAdapter.getRouter());

/* =========================================
   📊 Metrics Endpoint
========================================= */

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

/* =========================================
   🚀 Start Server
========================================= */

app.listen(3000, () => {
  console.log("🚀 API Server running on port 3000");
  console.log("🔐 BullBoard secured at http://localhost:3000/admin/queues");
});
