/**
 * Redis tabanlı token-bucket rate limiter (atomik Lua).
 * Anahtar: `rl:{dernek}:{service}` → dernek başına izolasyon.
 */
import { redis } from "./redis.js";

// KEYS[1]=bucket key; ARGV: rate, burst, now(ms), requested
const LUA = `
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = burst; ts = now end
local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(burst, tokens + elapsed * rate)
local allowed = 0
local retry = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
else
  retry = math.ceil((requested - tokens) / rate * 1000)
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(burst / rate * 1000) + 2000)
return {allowed, retry}
`;

export interface RateResult {
  allowed: boolean;
  retryAfterMs: number;
}

export async function tryConsume(
  dernek: string,
  service: string,
  rate: { ratePerSec: number; burst: number },
  requested = 1,
): Promise<RateResult> {
  const key = `rl:${dernek}:${service}`;
  const res = (await redis.eval(
    LUA,
    1,
    key,
    String(rate.ratePerSec),
    String(rate.burst),
    String(Date.now()),
    String(requested),
  )) as [number, number];
  return { allowed: res[0] === 1, retryAfterMs: res[1] };
}
