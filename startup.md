# STARTUP.md

This document explains how to run the **Background Job & Task Processing System** in different execution modes.

The system supports three types of job creation:

- **API-triggered jobs** (HTTP-based)
- **System-triggered jobs** (programmatic, no HTTP)
- **Scheduled jobs** (time-based, cron-like)

---

## 🔧 Prerequisites

- **Node.js** v12.x or higher (tested on v24.11.0)
- **Redis** connection (Upstash Cloud Redis recommended with TLS enabled)
- **Postman** or equivalent HTTP client for testing API endpoints

---

## ⚙️ Environment Setup

Create a `.env` file in the project root:

```bash
REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379
```

### Important Notes

- Use `rediss://` (with double 's') for TLS-enabled connections (required for Upstash)
- The `.env` file is **not** committed to version control
- All processes load Redis configuration from `shared/redis.js`

---

## 📦 Installation

Run once to install all dependencies:

```bash
npm install
```

---

## 1️⃣ API-Triggered Jobs (HTTP)

Jobs are created via HTTP requests and processed asynchronously by workers.

### Start API Server + Worker

```bash
npm run dev
```

This command starts:

- **API server** on `http://localhost:3000`
- **Worker process** listening on the Redis queue

### Create a Job via HTTP

Use **Postman** to send a POST request:

**Endpoint:** `POST http://localhost:3000/jobs`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "type": "welcome-email",
  "idempotencyKey": "welcome-email-anoop-v1",
  "payload": {
    "email": "anoop@example.com",
    "name": "Anoop",
    "message": "Background job system is live!"
  }
}
```

### Expected Behavior

1. API responds immediately with job acknowledgment
2. Job is queued in Redis
3. Worker picks up and processes the job asynchronously
4. Job status can be queried via `GET /jobs/:id/status`

---

## 2️⃣ System-Triggered Jobs (No HTTP)

Jobs are created internally by the system without any API call. This simulates internal system tasks, admin jobs, or maintenance workflows.

### Start Worker Only

```bash
npm run dev:worker
```

### Run System Producer

In a separate terminal:

```bash
node jobs/systemProducer.js
```

### Expected Behavior

1. Job is enqueued directly into Redis
2. Worker processes the job
3. Idempotency rules still apply
4. No HTTP request involved

### Use Cases

- Internal system tasks
- Administrative jobs
- Bootstrap or maintenance workflows
- Data migrations
- Cleanup operations

---

## 3️⃣ Scheduled Jobs (Cron-like)

Jobs are created automatically on a fixed time interval. This simulates cron jobs and periodic tasks.

### Start Worker

```bash
npm run dev:worker
```

### Start Scheduler

In a separate terminal:

```bash
node scheduler/cron.js
```

### Expected Behavior

1. Scheduler enqueues jobs periodically based on the configured interval
2. Jobs use **time-bucketed idempotency keys**
3. Same time window → no duplicate jobs
4. Safe across scheduler restarts
5. Worker processes all scheduled jobs

### Use Cases

- Cron jobs
- Periodic cleanup tasks
- Recurring reports
- Health checks
- Data synchronization

---

## 📊 Process Architecture

| Process | Role | Trigger |
|---------|------|---------|
| **API Server** | Accepts HTTP requests and enqueues jobs | HTTP POST |
| **System Producer** | Creates internal jobs programmatically | Script execution |
| **Scheduler** | Creates time-based recurring jobs | Time interval |
| **Worker** | Executes all jobs from the queue | Redis queue |
| **Redis** | Source of truth for job state and queue | N/A |

### Key Points

- All producers enqueue jobs into the **same Redis queue**
- Only the **worker** executes business logic
- Producers and consumers are **fully decoupled**
- Redis acts as the durable intermediary

---

## 🧪 Testing & Verification

### Check Job Status

Query any job's status via:

```
GET http://localhost:3000/jobs/:jobId/status
```

### Verify Worker Logs

Worker logs show:

- Job pickup from queue
- Execution start and completion
- Retry attempts (if applicable)
- Side-effect reservation and execution

### Verify Redis State

You can inspect Redis directly using:

- Upstash Console (for cloud Redis)
- Redis CLI: `redis-cli -u $REDIS_URL`

---

## 🔄 Development Workflow

### Start Everything (API + Worker)

```bash
npm run dev
```

### Start Worker Only

```bash
npm run dev:worker
```

### Start API Only

```bash
npm run dev:api
```

### Hot Reloading

The system uses **nodemon** for automatic restart on file changes during development.

---

## 🚀 Production Deployment Considerations

When deploying to production:

1. **Scale workers independently** from API servers
2. **Use managed Redis** (Upstash, AWS ElastiCache, etc.)
3. **Run scheduler as a singleton** to avoid duplicate scheduled jobs
4. **Monitor Redis queue depth** to detect processing delays
5. **Set up alerting** for failed jobs exceeding retry limits
6. **Use environment-specific** `.env` files

---

## 📁 Key Files

```
.
├── api/
│   ├── app.js                 # Express API server
│   └── controllers/
│       └── jobController.js   # Job creation endpoint
├── worker/
│   └── worker.js              # Job consumer/processor
├── scheduler/
│   └── cron.js                # Scheduled job producer
├── jobs/
│   └── systemProducer.js      # System job producer
├── shared/
│   └── redis.js               # Shared Redis connection
└── .env                       # Environment configuration
```

---

## 🎯 Project Status

This system is **feature-complete** and represents a production-ready architecture for background job processing.

### Core Features Implemented

✅ Durable job queuing with Redis  
✅ Idempotent job creation  
✅ Automatic retry with backoff  
✅ At-most-once side-effect execution  
✅ Observable job lifecycle  
✅ Three job creation modes (API, System, Scheduled)  
✅ Producer-consumer decoupling  

### Potential Future Enhancements

- Observability (metrics, tracing)
- Horizontal worker scaling
- Job prioritization
- Deployment automation
- Advanced monitoring dashboards

**Current behavior is stable and intentional.**

---

## 🆘 Troubleshooting

### Issue: Worker not processing jobs

**Solution:** Ensure Redis connection is valid and worker is running

```bash
# Check Redis connectivity
node -e "require('./shared/redis').then(c => c.ping().then(console.log))"

# Restart worker
npm run dev:worker
```

### Issue: Duplicate jobs being created

**Solution:** Ensure `idempotencyKey` is provided for all jobs

### Issue: Jobs stuck in 'waiting' state

**Solution:** Start the worker process

```bash
npm run dev:worker
```

### Issue: Connection errors with Upstash

**Solution:** Verify TLS is enabled in connection string (`rediss://` not `redis://`)

---

## 📚 Additional Resources

- See `PROJECT_CONTEXT.md` for architectural decisions and phase history
- See `README.md` for system overview and capabilities
- Check BullMQ documentation for advanced queue configuration

---

**Ready to process jobs at scale! 🚀**