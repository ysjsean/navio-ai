const DEFAULT_TO_SGD: Record<string, number> = {
  SGD: 1,
  USD: 1.35,
  EUR: 1.47,
  GBP: 1.72,
  AUD: 0.89,
  NZD: 0.82,
  CAD: 1.0,
  JPY: 0.009,
  CNY: 0.19,
  HKD: 0.17,
  THB: 0.038,
  MYR: 0.29,
  IDR: 0.000083,
  VND: 0.000053,
  KRW: 0.001,
};

let cachedRates: Record<string, number> | null = null;

function loadRates(): Record<string, number> {
  if (cachedRates) return cachedRates;

  const raw = process.env.FX_TO_SGD_JSON?.trim();
  if (!raw) {
    cachedRates = DEFAULT_TO_SGD;
    return cachedRates;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    const normalized: Record<string, number> = { ...DEFAULT_TO_SGD };
    for (const [code, rate] of Object.entries(parsed)) {
      const key = code.toUpperCase().trim();
      if (key && typeof rate === "number" && rate > 0) normalized[key] = rate;
    }
    cachedRates = normalized;
    return cachedRates;
  } catch {
    cachedRates = DEFAULT_TO_SGD;
    return cachedRates;
  }
}

export function convertToSgd(amount: number, currency: string): number | undefined {
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const code = (currency || "").toUpperCase().trim();
  if (!code) return undefined;

  const rates = loadRates();
  const rate = rates[code];
  if (!rate) return undefined;
  return round2(amount * rate);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
