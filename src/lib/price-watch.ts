import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

export interface BaselineListing {
  name: string;
  price: number;
  url: string;
}

export interface PriceWatch {
  id: string;
  chatId: string;
  area: string;
  dates?: { checkin: string; checkout: string };
  budget?: string;
  baseline: {
    bestOverall?: BaselineListing;
    cheapestAcceptable?: BaselineListing;
  };
  createdAt: number;
}

const WATCH_TTL = 60 * 60 * 24 * 30; // 30 days

export async function saveWatch(watch: PriceWatch): Promise<void> {
  await getRedis().set(`watch:${watch.id}`, watch, { ex: WATCH_TTL });
  await getRedis().sadd("price_watches", watch.id);
}

export async function getAllWatches(): Promise<PriceWatch[]> {
  const ids = await getRedis().smembers<string[]>("price_watches");
  if (!ids.length) return [];
  const watches = await Promise.all(
    ids.map((id) => getRedis().get<PriceWatch>(`watch:${id}`))
  );
  return watches.filter(Boolean) as PriceWatch[];
}

export async function updateWatchBaseline(
  id: string,
  baseline: PriceWatch["baseline"]
): Promise<void> {
  const watch = await getRedis().get<PriceWatch>(`watch:${id}`);
  if (!watch) return;
  await getRedis().set(`watch:${id}`, { ...watch, baseline }, { ex: WATCH_TTL });
}

export async function deleteWatch(id: string): Promise<void> {
  await getRedis().del(`watch:${id}`);
  await getRedis().srem("price_watches", id);
}
