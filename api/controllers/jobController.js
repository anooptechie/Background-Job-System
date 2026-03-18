const { addJob, getJobById } = require("../queue/jobQueue");
const { jobSchemas } = require("../validation/jobSchemas");
const deadLetterQueue = require("../queue/deadLetterQueue");

/* ======================================
   Create Job (Validated)
====================================== */

async function createJob(req, res) {
  const { type, payload, idempotencyKey } = req.body;

  // Basic field presence check
  if (!type || !payload || !idempotencyKey) {
    return res.status(400).json({
      error: "Job type, payload and idempotencyKey are required",
    });
  }

  // idempotencyKey validation
  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.trim().length === 0
  ) {
    return res.status(400).json({
      error: "idempotencyKey must be a non-empty string",
    });
  }

  if (/^[a-f0-9]{64}$/i.test(idempotencyKey)) {
    return res.status(400).json({
      error:
        "idempotencyKey must be a semantic client-defined value, not a jobId",
    });
  }

  // Schema existence check
  const schema = jobSchemas[type];

  if (!schema) {
    return res.status(400).json({
      error: `Unsupported job type: ${type}`,
    });
  }

  // Payload validation
  const validation = schema.safeParse(payload);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: validation.error.flatten(),
    });
  }

  try {
    const job = await addJob(type, validation.data, idempotencyKey);

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

/* ======================================
   Get Job Status
====================================== */

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
    console.error("Failed to fetch job status:", err);

    return res.status(500).json({
      error: "Failed to fetch job status",
    });
  }
}

// New function to get DLQ jobs
async function getDLQJobs(req, res) {
  try {
    const jobs = await deadLetterQueue.getJobs(
      ["waiting", "failed", "completed", "delayed"],
      0,
      20,
    );

    const data = (jobs || []).map((job) => ({
      id: job.id,
      originalJobId: job.data?.originalJobId,
      type: job.data?.jobType,
      attemptsMade: job.data?.attemptsMade,
      failedReason: job.data?.failedReason,
      failedAt: job.data?.failedAt,
    }));

    res.status(200).json(data);
  } catch (err) {
    console.error("DLQ ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch DLQ jobs" });
  }
}

// New function for replaying DLQ job and also to prevent infinite loops by removing any forceFail flags from the payload.
async function replayDLQJob(req, res) {
  try {
    const { id } = req.params;

    const dlqJob = await deadLetterQueue.getJob(id);

    if (!dlqJob) {
      return res.status(404).json({ error: "DLQ job not found" });
    }

    const { jobType, payload, originalJobId } = dlqJob.data;

    // 🔥 Prevent infinite replay loop
    const cleanedPayload = { ...payload };
    delete cleanedPayload.forceFail;

    const newJob = await addJob(
      jobType,
      {
        ...cleanedPayload,
        replayedFromJobId: originalJobId,
        replayedAt: new Date().toISOString(),
      },
      "replay-" + Date.now(),
    );

    return res.status(200).json({
      message: "Job replayed successfully",
      jobId: newJob.id,
      replayedFrom: originalJobId,
    });
  } catch (err) {
    console.error("Replay DLQ ERROR:", err);
    return res.status(500).json({ error: "Failed to replay DLQ job" });
  }
}

module.exports = {
  createJob,
  getJobStatus,
  getDLQJobs,
  replayDLQJob,
};
