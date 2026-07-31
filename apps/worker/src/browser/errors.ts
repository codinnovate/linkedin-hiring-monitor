export const ErrorCode = {
  LOGIN_EXPIRED: "LOGIN_EXPIRED",
  RATE_LIMITED: "RATE_LIMITED",
  NAVIGATION_TIMEOUT: "NAVIGATION_TIMEOUT",
  NETWORK: "NETWORK",
  PROXY: "PROXY",
  PARSE: "PARSE",
  BROWSER: "BROWSER",
  CHECKPOINT: "CHECKPOINT",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ClassifiedError {
  code: ErrorCode;
  retryable: boolean;
  /** Recommended delay in ms before retrying (rate limits, cooldowns). */
  suggestedDelayMs: number;
}

export class LinkedInBrowserError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly suggestedDelayMs: number;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    retryable = true,
    suggestedDelayMs = 0,
  ) {
    super(message);
    this.name = "LinkedInBrowserError";
    this.code = code;
    this.retryable = retryable;
    this.suggestedDelayMs = suggestedDelayMs;
  }
}

const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Maps a thrown value to a structured classification used by the retry
 * and error-recovery machinery.
 */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof LinkedInBrowserError) {
    return {
      code: error.code,
      retryable: error.retryable,
      suggestedDelayMs: error.suggestedDelayMs,
    };
  }

  const message = error instanceof Error ? error.message : String(error);

  if (
    /too many requests|rate.?limit|status.?429|temporarily.?blocked|unusual traffic/i.test(message)
  ) {
    return {
      code: ErrorCode.RATE_LIMITED,
      retryable: true,
      suggestedDelayMs: RATE_LIMIT_COOLDOWN_MS,
    };
  }
  if (
    /authwall|\/signup|please.?sign.?in|session.{0,10}expired|log.?in.*required/i.test(message) &&
    !/net::/i.test(message)
  ) {
    return { code: ErrorCode.LOGIN_EXPIRED, retryable: true, suggestedDelayMs: 5 * 60 * 1000 };
  }
  if (/checkpoint|verification|challenge|two.?factor|2fa/i.test(message)) {
    return { code: ErrorCode.CHECKPOINT, retryable: false, suggestedDelayMs: 0 };
  }
  if (/navigation timeout|net::ERR_TIMED_OUT/i.test(message)) {
    return { code: ErrorCode.NAVIGATION_TIMEOUT, retryable: true, suggestedDelayMs: 30_000 };
  }
  if (/net::ERR_PROXY|proxy.*failed|ECONNREFUSED.*proxy/i.test(message)) {
    return { code: ErrorCode.PROXY, retryable: true, suggestedDelayMs: 60_000 };
  }
  if (
    /net::ERR_(CONNECTION_RESET|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_REFUSED|CONNECTION_CLOSED|ADDRESS_UNREACHABLE)/i.test(
      message,
    )
  ) {
    return { code: ErrorCode.NETWORK, retryable: true, suggestedDelayMs: 15_000 };
  }
  if (
    /net::ERR_|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ECONN|ETIMEDOUT|EAI_AGAIN|ENETUNREACH/i.test(
      message,
    )
  ) {
    return { code: ErrorCode.NETWORK, retryable: true, suggestedDelayMs: 10_000 };
  }
  if (/target (page|frame|context)|browser (has been )?closed|process crashed/i.test(message)) {
    return { code: ErrorCode.BROWSER, retryable: true, suggestedDelayMs: 5_000 };
  }
  if (/no element found|waiting for .* failed|locator/i.test(message)) {
    return { code: ErrorCode.PARSE, retryable: false, suggestedDelayMs: 0 };
  }
  return { code: ErrorCode.UNKNOWN, retryable: false, suggestedDelayMs: 0 };
}
