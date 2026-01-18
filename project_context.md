# 📘 PROJECT_CONTEXT.md

```md
# PROJECT_CONTEXT.md

This document captures stable architectural decisions and system behavior.
It excludes experimentation, debugging history, and implementation noise.

---

## Project Purpose

The system is designed to demonstrate background job processing beyond simple request–response APIs.

Primary goals:

- Decouple job creation from execution
- Ensure durability of background work
- Make asynchronous workflows observable
- Avoid overengineering while preserving correctness

---

## Architecture Decisions

### Producer–Consumer Model

- API server acts as a **job producer**
- Worker process acts as a **job consumer**
- Redis acts as a durable intermediary

API and worker lifecycles are fully independent.

---

## Job Lifecycle (Frozen — Phase 2)

Jobs have a well-defined lifecycle managed by BullMQ and Redis.

Observed states include:

- `waiting`
- `active`
- `completed`
- `failed`

Key decisions:

- Job state is sourced directly from BullMQ
- No custom job-status database is introduced
- No duplication of job metadata
- Status access is read-only

Jobs may remain in `waiting` state when no workers are running. This behavior is intentional and correct.

---

## Job Status API

A single endpoint is exposed for job status:
GET /jobs/:id/status


Design principles:

- One endpoint for all job states
- No state-specific endpoints
- No polling strategy enforced by the backend
- Clients decide how and when to query status

This approach aligns with real-world async system design.

---

## Job Input Contract (Phase 1–2)

Jobs are submitted as structured JSON objects with:

- `type` — identifies the job category
- `payload` — contains job-specific data and metadata

Example:

```json
{
  "type": "welcome-email",
  "payload": {
    "email": "anoop@example.com",
    "name": "Anoop",
    "message": "Congratulations! Your background job system is live."
  }
}

Configuration Strategy

All environment-specific configuration is externalized

Redis connection details are provided via REDIS_URL

.env is used for local development convenience

process.env is the runtime source of truth

No credentials are committed to version control.

Tooling Decisions

Postman is used during development to simulate realistic client requests

curl is not a required part of the system design anymore

Developer tooling (nodemon, concurrently) improves workflow without altering architecture

Version Status

Phase 2 complete

Job lifecycle is observable

Background processing is durable and decoupled

Subsequent phases will extend reliability (retries, backoff, failure handling) without altering these foundations.