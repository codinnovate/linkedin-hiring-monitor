import { classifyError } from "./errors.js";

export interface RetryOptions {
  /** Total number of attempts, including the first. */
  attempts: number;
  /** Base delay before the first retry. */
  baseDelayMs?: number;
  /** Upper bound for exponential backoff. */
  maxDelayMs?: number;
  /** Backoff multiplier per attempt. */
  factor?: number;
  /** Add random jitter to avoid thundering herds. */
  jitter?: boolean;
  /** Custom retry predicate. Defaults to the error classifier. */
  retryable?: (error: unknown) => boolean;
  /** Called before each retry attempt with the last error. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULTS: Required<Pick<RetryOptions, "baseDelayMs" | "maxDelayMs" | "factor" | "jitter">> = {
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  factor: 2,
  jitter: true,
};

/** Runs fn, retrying on failure according to options. Throws on final failure. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { attempts, onRetry, retryable } = options;
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const factor = options.factor ?? DEFAULTS.factor;
  const jitter = options.jitter ?? DEFAULTS.jitter;

  if (attempts < 1) throw new Error("withRetry requires attempts >= 1");

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;

      const shouldRetry = retryable ? retryable(error) : classifyError(error).retryable;
      if (!shouldRetry) break;

      const classified = classifyError(error);
      const computedDelay =
        options.baseDelayMs === undefined && classified.suggestedDelayMs > 0
          ? classified.suggestedDelayMs
          : baseDelayMs * factor ** (attempt - 1);
      const delay = Math.min(maxDelayMs, computedDelay);
      const sleepMs = jitter ? applyJitter(delay) : delay;

      onRetry?.(error, attempt, sleepMs);
      await sleep(sleepMs);
    }
  }
  throw lastError;
}

function applyJitter(delayMs: number): number {
  // Full jitter: random between 50% and 100% of the computed delay.
  return Math.round(delayMs * (0.5 + Math.random() * 0.5));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
