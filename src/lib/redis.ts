import { Redis } from "ioredis";
import { env } from "../config/env.js";

/**
 * BullMQ için paylaşılan Redis bağlantısı.
 * BullMQ maxRetriesPerRequest: null ister.
 */
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Rate-limiter / blacklist gibi normal işlemler için ayrı client (bloklanan komutlardan etkilenmesin)
export const redis = new Redis(env.REDIS_URL);
