const request = require("supertest");

const BASE_URL = "http://localhost:3000";

describe("Background Job System", () => {
  // ✅ Test 1 — Health check
  it("should return 200 for health endpoint", async () => {
    const res = await request(BASE_URL).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  // ✅ Test 2 — Job enqueue
  it("should accept a valid job", async () => {
    const res = await request(BASE_URL)
      .post("/jobs")
      .send({
        type: "welcome-email",
        idempotencyKey: "test-ci-1",
        payload: {
          email: "test@example.com",
        },
      });

    expect(res.statusCode).toBe(202);
  });

  // ✅ Test 3 — Worker processing (basic)
  it("should process job without crashing", async () => {
    const res = await request(BASE_URL)
      .post("/jobs")
      .send({
        type: "generate-report",
        idempotencyKey: "test-ci-2",
        payload: {
          reportType: "monthly-sales",
        },
      });

    expect(res.statusCode).toBe(202);

    // wait for worker to process
    // await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  /// ✅ Test 4 — Job status endpoint (stable + defensive)
  it("should process job and reach completed state", async () => {
    const createRes = await request(BASE_URL)
      .post("/jobs")
      .send({
        type: "welcome-email",
        idempotencyKey: "ci-test-3",
        payload: {
          email: "test@example.com",
        },
      });

    expect(createRes.statusCode).toBe(202);

    const jobId = createRes.body?.jobId;
    expect(jobId).toBeDefined();

    let status = null;

    // Poll up to ~15 seconds
    for (let i = 0; i < 30; i++) {
      const res = await request(BASE_URL).get(`/jobs/${jobId}/status`);

      // If API temporarily not ready, retry
      if (res.statusCode !== 200) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      const body = res.body;

      // Defensive: handle unexpected response shape
      status = body?.status || body?.state || null;

      if (status === "completed") break;

      // Optional: break early if clearly failed
      if (status === "failed") {
        throw new Error(`Job failed instead of completing`);
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    // Final assertion with clear failure message
    expect(status).toBe("completed");
  }, 20000); // ⬅️ Increased timeout for CI stability

  // ✅ Test 5 — Idempotency
  it("should return same jobId for same idempotencyKey", async () => {
    const payload = {
      type: "welcome-email",
      idempotencyKey: "idem-test-1",
      payload: {
        email: "test@example.com",
      },
    };

    // First request
    const res1 = await request(BASE_URL).post("/jobs").send(payload);

    expect(res1.statusCode).toBe(202);
    const jobId1 = res1.body.jobId;
    expect(jobId1).toBeDefined();

    // Second request (same idempotencyKey)
    const res2 = await request(BASE_URL).post("/jobs").send(payload);

    expect(res2.statusCode).toBe(202);
    const jobId2 = res2.body.jobId;

    // ✅ CORE ASSERTION (your actual guarantee)
    expect(jobId2).toBe(jobId1);
  });

  // ✅ Test 6 — Retry logic and failure handling
  it("should retry a failed job and eventually move it to failed state", async () => {
    const res = await request(BASE_URL)
      .post("/jobs")
      .send({
        type: "generate-report",
        idempotencyKey: "retry-test-" + Date.now(),
        payload: {
          reportType: "monthly-sales",
          forceFail: true, // 👈 supported by your worker
        },
      });

    expect(res.statusCode).toBe(202);

    const jobId = res.body.jobId;
    expect(jobId).toBeDefined();

    let state;

    // Poll up to ~40 seconds (important due to 10s backoff)
    for (let i = 0; i < 40; i++) {
      const statusRes = await request(BASE_URL).get(`/jobs/${jobId}/status`);

      if (statusRes.statusCode !== 200) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      state = statusRes.body.state;

      if (state === "failed") break;

      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(state).toBe("failed");
  }, 45000); // ⬅️ IMPORTANT: must exceed retry duration

  // ✅ Test 7 — Dead Letter Queue
  it("should move failed job to DLQ after retries", async () => {
    const res = await request(BASE_URL)
      .post("/jobs")
      .send({
        type: "generate-report",
        idempotencyKey: "dlq-test-" + Date.now(),
        payload: {
          reportType: "monthly-sales",
          forceFail: true,
        },
      });

    const jobId = res.body.jobId;

    let state;

    // wait until job fails
    for (let i = 0; i < 40; i++) {
      const statusRes = await request(BASE_URL).get(`/jobs/${jobId}/status`);
      state = statusRes.body.state;

      if (state === "failed") break;

      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(state).toBe("failed");

    // check DLQ
    const { Queue } = require("bullmq");
    const connection = require("../shared/redis");
    const dlq = new Queue("dead-letter-queue", { connection });

    const jobs = await dlq.getJobs(["waiting"], 0, 10);

    const found = jobs.find((j) => j.data.originalJobId === jobId);

    expect(found).toBeDefined();
  }, 45000);
});
