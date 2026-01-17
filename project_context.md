Project Name

Background Job & Task Processing System

Purpose

This document is the canonical snapshot of the system.

It captures:

Stable architectural decisions

Verified behavior

Frozen scope boundaries

It intentionally excludes:

Debugging history

Tooling struggles

Experiments and dead ends

Core Problem Statement

HTTP request–response cycles are unsuitable for slow, unreliable, or heavy work.

This system provides a general-purpose background job mechanism where work is:

Enqueued quickly

Executed later

Isolated from user-facing APIs

System Scope (Frozen)
In Scope

Job creation via API

Redis-backed job queue

Worker-based job execution

Asynchronous processing model

Out of Scope

Authentication / authorization

UI dashboards

Horizontal worker scaling strategies

Kubernetes or container orchestration

Real external integrations (email, storage, etc.)

Architecture Decisions

Redis chosen as the queue backend

BullMQ chosen for job abstraction

API and worker run as independent Node.js processes

Redis connection provided via environment variables

All decisions are frozen for V1.

Job Definition

A job is defined as:

A unit of work

Created at one point in time

Executed later by a worker

Independent of HTTP lifecycle

Jobs are identified by:

Job ID

Job type (name)

Payload (data)

Execution Model

API acts as job producer

Worker acts as job consumer

Redis acts as durable intermediary

The API never executes job logic.

Failure Philosophy (Early Stage)

Worker crashes must not crash API

Failed jobs must not crash workers

Visibility and retries are handled in later phases

Configuration Strategy

All infrastructure configuration is externalized

No secrets or endpoints are hardcoded

Environment variables are mandatory

Status

Phase 1 complete. System verified end-to-end:

Job creation

Queue persistence

Worker execution

Future phases build incrementally on this foundation.