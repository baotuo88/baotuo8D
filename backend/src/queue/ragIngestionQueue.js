import { Queue, QueueEvents } from "bullmq";
import { env } from "../config/env.js";
import { redisConnection } from "./redis.js";

const queueName = env.queueRagIngestionName;

export const ragIngestionQueue = new Queue(queueName, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: Math.max(env.queueRagIngestionAttempts, 1),
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: 200,
    removeOnFail: 500
  }
});

export const ragIngestionQueueEvents = new QueueEvents(queueName, {
  connection: redisConnection
});

export async function enqueueRagIngestionJob(payload) {
  return ragIngestionQueue.add("ingest", payload);
}

export async function getRagIngestionJob(jobId) {
  return ragIngestionQueue.getJob(jobId);
}
