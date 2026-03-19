const redis = require("../../shared/redis");

const LIMIT = 5; // requests per second

async function rateLimiter(req, res, next) {
  try {
    const userId = req.headers["x-user-id"] || req.ip || "anonymous";

    const key = `rate_limit:${userId}`;

    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, 1); // 1 second window
    }

    // ✅ Add rate limit headers (NEW)
    res.set("X-RateLimit-Limit", LIMIT);
    res.set("X-RateLimit-Remaining", Math.max(0, LIMIT - current));

    // ✅ Add logging when limit exceeded (NEW)
    if (current > LIMIT) {
      console.warn(`Rate limit exceeded for ${userId}`);

      return res.status(429).json({
        error: "Too many requests",
      });
    }

    next();
  } catch (err) {
    // 🔥 IMPORTANT: never block system if Redis fails
    console.error("Rate limiter error:", err.message);
    next();
  }
}

module.exports = rateLimiter;
