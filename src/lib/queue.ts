import { Queue } from "bullmq";
import { connection } from "./redis.js";
import type { Channel } from "../channels/sender.js";

export interface SendJobData {
  dernek: string;
  channel: Channel;
  campaignId: string;
  recipientId: string | number;
  to: string;
  templateRef?: string;
  languageCode?: string;
  vars?: { header?: string[]; body?: string[] };
  body?: string;
  iysfilter?: "0" | "11" | "12";
}

export const SEND_QUEUE = "send";

export const sendQueue = new Queue<SendJobData, unknown, string>(SEND_QUEUE, {
  // BullMQ kendi ioredis'ini bundle ettiği için instance tipi uyuşmaz; runtime'da aynı.
  connection: connection as unknown as never,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

// --- Dinamik akış (journey) kuyruğu ---
export interface JourneyJobData {
  dernek: string;
  ruleId: string;
  contactId: string;
}

export const JOURNEY_QUEUE = "journey";

export const journeyQueue = new Queue<JourneyJobData, unknown, string>(JOURNEY_QUEUE, {
  connection: connection as unknown as never,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
