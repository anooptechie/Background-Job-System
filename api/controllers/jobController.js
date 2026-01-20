const { addJob, getJobById } = require("../queue/jobQueue");

async function createJob(req, res) {
  const { type, payload, idempotencyKey } = req.body;

  if (!type || !payload || !idempotencyKey) {
    return res.status(400).json({
      error: "Job type, payload and idempotencyKey are required",
    });
  }

  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.trim().length === 0
  ) {
    return res.status(400).json({
      error: "idempotencyKey must be a string and it cannot be empty",
    });
  }

  if (/^[a-f0-9]{64}$/i.test(idempotencyKey)) {
    return res.status(400).json({
      error:
        "idempotencyKey must be a semantic client-defined value, not a jobId",
    });
  }

  if (
    !payload.email ||
    typeof payload.email !== "string" ||
    payload.email.trim().length === 0
  ) {
    return res.status(400).json({
      error: "payload.email is required and must be a non-empty string",
    });
  }

  try {
    const job = await addJob(type, payload, idempotencyKey);

    return res.status(202).json({
      status: "accepted",
      jobId: job.id,
    });
  } catch (err) {
    console.error("Enqueue Error:", err.message);

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
