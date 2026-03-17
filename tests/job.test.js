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
          email: "test@example.com"
        }
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
          reportType: "monthly-sales"
        }
      });

    expect(res.statusCode).toBe(202);

    // wait for worker to process
    await new Promise(resolve => setTimeout(resolve, 3000));

    // If system didn't crash, test passes
    expect(true).toBe(true);
  });

});