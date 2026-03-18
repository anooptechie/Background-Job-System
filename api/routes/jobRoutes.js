const express = require("express");
const {
  createJob,
  getJobStatus,
  getDLQJobs,
} = require("../controllers/jobController");

const router = express.Router();

router.post("/", createJob);
router.get("/dlq", getDLQJobs);

router.get("/:id/status", getJobStatus);

module.exports = router;
