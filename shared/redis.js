require("dotenv").config();
const IORedis = require("ioredis");

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not defined");
}

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: {}, // REQUIRED for Upstash (even with redis://)
});

connection.on("connect", () => {
  console.log("✅ Redis connected");
});

connection.on("error", (err) => {
  console.error("❌ Redis connection error:", err.message);
});

module.exports = connection;

//Redis connection provided via environment variables