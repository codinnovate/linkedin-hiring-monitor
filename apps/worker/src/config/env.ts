import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_BASE_URL: z.string().url().optional(),

  PLAYWRIGHT_HEADLESS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  PLAYWRIGHT_SLOW_MO: z.coerce.number().int().nonnegative().default(0),
  PROXY_LIST: z.string().default(""),
  PROXY_ROTATE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  USER_AGENT_POOL: z.string().default(""),
  LINKEDIN_COOKIES_FILE: z.string().default(""),
  LINKEDIN_EMAIL: z.string().default(""),
  LINKEDIN_PASSWORD: z.string().default(""),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WORKER_MAX_JOBS_PER_RUN: z.coerce.number().int().positive().default(10),
  MAX_SCROLL_PAGES: z.coerce.number().int().positive().default(30),
  SCROLL_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  SEARCH_CRON: z.string().default("*/5 * * * *"),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_IDS: z.string().default(""),
  DISCORD_WEBHOOK_URLS: z.string().default(""),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("LinkedIn Hiring Monitor <no-reply@example.com>"),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates and returns typed environment configuration. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
