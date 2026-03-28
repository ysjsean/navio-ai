import { FinalRunResult } from "@/types/listing";

const STORE_KEY = "__navio_run_store__";

type StoreShape = Map<string, FinalRunResult>;

function getStore(): StoreShape {
  const globalObj = globalThis as typeof globalThis & {
    [STORE_KEY]?: StoreShape;
  };

  if (!globalObj[STORE_KEY]) {
    globalObj[STORE_KEY] = new Map<string, FinalRunResult>();
  }

  return globalObj[STORE_KEY];
}

export function saveRunResult(result: FinalRunResult) {
  getStore().set(result.runId, result);
}

export function getRunResult(runId: string): FinalRunResult | null {
  return getStore().get(runId) ?? null;
}
