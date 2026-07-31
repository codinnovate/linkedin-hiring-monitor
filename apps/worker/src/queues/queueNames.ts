export const QUEUES = {
  /** Fired by the scheduler; one job per search run. */
  SEARCH: "lhm-search",
  /** One job per notification to deliver. */
  NOTIFICATION: "lhm-notification",
  /** Failed jobs routed here for retry/debug. */
  DEAD_LETTER: "lhm-dead-letter",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
