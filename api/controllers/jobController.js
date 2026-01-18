const { addJob, getJobById } = require("../queue/jobQueue");

async function createJob(req, res) {
  const { type, payload } = req.body;

  if (!type || !payload) {
    return res.status(400).json({
      error: "Job type and payload are required",
    });
  }

  try {
    const job = await addJob(type, payload);

    return res.status(202).json({
      status: "accepted",
      jobId: job.id,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to enqueue job",
    });
  }
}

async function getJobStatus(req, res) {
  const { id } = req.params;

  try {
    const job = await getJobById(id);

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
      });
    }

    const state = await job.getState();

    return res.status(200).json({
      jobId: job.id,
      type: job.name,
      state,
      createdAt: new Date(job.timestamp).toISOString(),
      processedAt: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
      failedReason: job.failedReason || null,
    });
  } catch (err) {
    console.error("❌ Failed to fetch job status:", err);

    return res.status(500).json({
      error: "Failed to fetch job status",
    });
  }
}

module.exports = {
  createJob,
  getJobStatus,
};
