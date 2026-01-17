const IORedis = require("ioredis");

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not defined");
}

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: {}, // REQUIRED for Upstash (even with redis://)
});

module.exports = connection;

//Redis connection provided via environment variables