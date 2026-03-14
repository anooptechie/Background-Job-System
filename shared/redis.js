require("dotenv").config();
const IORedis = require("ioredis");

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not defined");
}

const redisUrl = process.env.REDIS_URL;

const connection =
  redisUrl.startsWith("rediss://")
    ? new IORedis(redisUrl, { maxRetriesPerRequest: null, tls: {} })
    : new IORedis(redisUrl, { maxRetriesPerRequest: null });

connection.on("connect", () => {
  console.log("✅ Redis connected");
});

connection.on("error", (err) => {
  console.error("❌ Redis connection error:", err.message);
});

module.exports = connection;
