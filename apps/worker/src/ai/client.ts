import type { Logger } from "pino";

/** Raised when an AI request fails or returns an unusable response. */
export class AiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletion {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface OpenAiClientOptions {
  apiKey: string;
  model: string;
  /** Base URL of an OpenAI-compatible endpoint, e.g. for a proxy. */
  baseUrl?: string;
  /** Retries for 429/5xx responses. */
  maxRetries?: number;
  /** Inject a custom fetch (tests, mocks). */
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Minimal OpenAI-compatible chat-completions client. Uses plain fetch so
 * it works against any compatible endpoint and stays dependency-light.
 */
export class OpenAiClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: Logger;

  constructor(options: OpenAiClientOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.maxRetries = options.maxRetries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger;
  }

  async complete(messages: ChatMessage[]): Promise<AiCompletion> {
    let attempt = 0;
    for (;;) {
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        throw new AiRequestError(
          `openai request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (response.ok) {
        const body = (await response.json()) as {
          model?: string;
          choices?: Array<{ message?: { content?: unknown } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = body.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
          throw new AiRequestError("invalid completion response: missing message content");
        }
        return {
          content,
          model: body.model ?? this.model,
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - startedAt,
        };
      }

      attempt += 1;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt > this.maxRetries) {
        const detail = await response.text().catch(() => "");
        throw new AiRequestError(
          `openai request failed (${response.status}): ${detail.slice(0, 300)}`,
          response.status,
        );
      }

      const delay = Math.min(60_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      this.logger?.warn({ status: response.status, attempt, delayMs: delay }, "openai retry");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
