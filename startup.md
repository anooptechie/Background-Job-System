Background Jobs System - Startup Guide
This project is a distributed background processing system built with Node.js, BullMQ, and Upstash Redis. It follows a Producer-Consumer architecture to handle heavy tasks asynchronously.

🛠 Prerequisites
Node.js: v12.x or higher (Tested on v24.11.0)

Redis: Upstash Cloud Redis (TCP/TLS enabled)

Tools: Postman or cURL for testing

🏃‍♂️ How to Start
1. Configuration
Ensure your .env file exists in the root directory with your Upstash credentials:

Code snippet

REDIS_URL=rediss://default:your_password@your-endpoint.upstash.io:6379
2. Installation

npm install
3. Running the System
You can run both the API and the Worker simultaneously using the following command:

npm run dev
API Server: Running on http://localhost:3000

Worker: Listening for jobs in the jobs-queue

🧪 Testing the System
To trigger a job, send a POST request (not a GET request from a browser) to the /jobs endpoint.

Request Details
URL: http://localhost:3000/jobs

Method: POST

Headers: Content-Type: application/json

Body (JSON):

JSON

{
  "type": "email-notification",
  "payload": {
    "to": "user@example.com",
    "message": "System check successful!"
  }
}

🏗 Architecture Overview
API (/api/app.js): The entry point. It receives requests and hands them off to the Controller.

Producer (/api/controllers/jobController.js): Adds the job data to the BullMQ queue stored in Redis.

Queue (/api/queue/jobQueue.js): Manages the connection to the specific jobs-queue.

Redis (/shared/redis.js): Shared connection logic using ioredis with TLS support.

Worker (/worker/worker.js): A separate process that watches Redis, pulls jobs, and executes the business logic (with a simulated 2-second delay).