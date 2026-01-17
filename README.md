Background Job & Task Processing System
Purpose

This project demonstrates how to design and implement asynchronous background job processing outside the HTTP request–response cycle. The system allows clients to enqueue work, while independent workers execute that work later with reliability and isolation.

The goal is to learn infrastructure-grade backend patterns, not to build a user-facing product.

What This System Does

Accepts job creation requests via an API

Persists jobs in a Redis-backed queue

Executes jobs asynchronously using worker processes

Decouples slow or unreliable work from HTTP requests

What This System Intentionally Avoids

To prevent overengineering and burnout, the following are explicitly excluded:

UI dashboards

Kubernetes or container orchestration

Real email providers

File uploads or storage

Authentication and authorization

WebSockets or real-time UIs

Multi-language workers

This is a depth-over-breadth project.

Architecture Overview
Client
  |
  | POST /jobs
  v
API Server (Producer)
  |
  | enqueue job
  v
Redis Queue (BullMQ)
  |
  | fetch job
  v
Worker Process (Consumer)
  |
  | execute job
  v
Job Completed

Key Properties

API and workers are separate processes

API never executes background work

Workers operate independently of HTTP requests

Redis is the coordination and persistence layer

Job Lifecycle (Phase 1)

Client submits a job request

API validates input and enqueues the job

API responds immediately with 202 Accepted

Worker pulls the job from Redis

Worker executes the job asynchronously

Supported Job Types (Initial)

email — simulated email send (console log)

report — simulated long-running task

dummy — used for testing retries and failures

These job types exist to exercise system behavior, not business logic.

Tech Stack

Node.js

Express.js

BullMQ

Redis (managed Redis via Upstash during development)

ioredis

Running the Project (Local)
Prerequisites

Node.js

Redis-compatible endpoint (managed or local)

Environment Variable

The application requires a Redis connection string:

REDIS_URL=<redis connection url>

This is read from process.env and is not hardcoded.

Project Status

Phase 0: Design & Scope — Complete

Phase 1: Core Job Queue — Complete

Phase 2+: Planned

Learning Outcomes

Designed async systems beyond request–response

Implemented background job queues and workers

Understood worker isolation and failure boundaries

Built infrastructure-style backend components