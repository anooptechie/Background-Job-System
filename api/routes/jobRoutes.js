const express = require("express");
const {
  createJob,
  getJobStatus,
  getDLQJobs,
  replayDLQJob
} = require("../controllers/jobController");

const router = express.Router();

router.post("/", createJob);
router.get("/dlq", getDLQJobs);

router.get("/:id/status", getJobStatus);
router.post("/dlq/:id/replay", replayDLQJob);

module.exports = router;
