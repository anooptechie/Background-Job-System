const jobQueue = require("../queue/jobQueue");

exports.createJob = async (req, res) => {
  const { type, payload } = req.body;

  if (!type) {
    return res.status(400).json({
      status: "fail",
      message: "Job type is required",
    });
  }

  const job = await jobQueue.add(type, payload || {});

  res.status(202).json({
    status: "accepted",
    jobId: job.id,
    message: "Job enqueued successfully",
  });
};

//type = jobType
//payload = job data
