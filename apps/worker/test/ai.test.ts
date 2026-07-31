import { contentHash } from "@lhm/shared";
import { createPrismaClient } from "@lhm/database";
import type { PrismaClient } from "@lhm/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyClassifications,
  classifyMany,
  classifyPost,
  isClassificationOutcome,
} from "../src/ai/classify.js";
import { OpenAiClient } from "../src/ai/client.js";
import { buildClassificationUserPrompt, CLASSIFICATION_SYSTEM_PROMPT } from "../src/ai/prompts.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://lhm:lhm_password@localhost:5432/lhm_test?schema=public";

const HIRING_RESULT = {
  isHiring: true,
  confidence: 90,
  role: "Senior React Native Engineer",
  company: "Acme Inc",
  location: "Berlin",
  remote: true,
  skills: ["react native", "typescript"],
  employmentType: "full-time",
  salaryMentioned: "$120k-$150k",
  reason: "Explicit job posting with role and compensation.",
};

function completionBody(result: unknown, content?: string): string {
  return JSON.stringify({
    model: "gpt-5-mini-test",
    choices: [{ message: { content: content ?? JSON.stringify(result) } }],
    usage: { prompt_tokens: 120, completion_tokens: 40 },
  });
}

function mockFetch(handler: (init?: RequestInit) => Promise<Response>): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) =>
    handler(init)) as typeof fetch;
}

function makeClient(handler: (init?: RequestInit) => Promise<Response>): OpenAiClient {
  return new OpenAiClient({
    apiKey: "test-key",
    model: "gpt-5-mini-test",
    fetchImpl: mockFetch(handler),
  });
}

const INPUT = {
  postId: "9001",
  text: "We're hiring a Senior React Native Engineer! Join our team in Berlin.",
  authorName: "Jane Doe",
  authorHeadline: "Staff Engineer at Acme Inc",
  company: "Acme Inc",
};

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

describe("prompts", () => {
  it("asks for the exact JSON shape", () => {
    for (const key of ['"isHiring"', '"confidence"', '"role"', '"skills"', '"reason"']) {
      expect(CLASSIFICATION_SYSTEM_PROMPT).toContain(key);
    }
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("JSON");
  });

  it("embeds post context in the user prompt", () => {
    const prompt = buildClassificationUserPrompt(INPUT);
    expect(prompt).toContain("Author: Jane Doe");
    expect(prompt).toContain("Headline: Staff Engineer at Acme Inc");
    expect(prompt).toContain("Company: Acme Inc");
    expect(prompt).toContain(INPUT.text);
  });
});

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

describe("OpenAiClient", () => {
  it("returns a parsed completion with usage and latency", async () => {
    const client = makeClient(
      async () => new Response(completionBody(HIRING_RESULT), { status: 200 }),
    );
    const completion = await client.complete([{ role: "user", content: "hi" }]);
    expect(completion.content).toBe(JSON.stringify(HIRING_RESULT));
    expect(completion.model).toBe("gpt-5-mini-test");
    expect(completion.inputTokens).toBe(120);
    expect(completion.outputTokens).toBe(40);
    expect(completion.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("retries on 429 and succeeds on the next attempt", async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls += 1;
      return calls === 1
        ? new Response("rate limited", { status: 429 })
        : new Response(completionBody(HIRING_RESULT), { status: 200 });
    });
    const completion = await client.complete([{ role: "user", content: "hi" }]);
    expect(calls).toBe(2);
    expect(completion.content).toBe(JSON.stringify(HIRING_RESULT));
  });

  it("throws after exhausting retries on 5xx", async () => {
    let calls = 0;
    const client = new OpenAiClient({
      apiKey: "test-key",
      model: "gpt-5-mini-test",
      maxRetries: 1,
      fetchImpl: mockFetch(async () => {
        calls += 1;
        return new Response("server error", { status: 500 });
      }),
    });
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      name: "AiRequestError",
      status: 500,
    });
    expect(calls).toBe(2);
  });

  it("does not retry client errors (4xx)", async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls += 1;
      return new Response("bad request", { status: 400 });
    });
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      status: 400,
    });
    expect(calls).toBe(1);
  });

  it("rejects responses without message content", async () => {
    const client = makeClient(
      async () => new Response('{"choices":[{"message":{}}]}', { status: 200 }),
    );
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(
      "missing message content",
    );
  });
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe("classifyPost", () => {
  it("parses and validates a valid structured response", async () => {
    const client = makeClient(
      async () => new Response(completionBody(HIRING_RESULT), { status: 200 }),
    );
    const outcome = await classifyPost(client, INPUT);
    expect(outcome.result.isHiring).toBe(true);
    expect(outcome.result.role).toBe("Senior React Native Engineer");
    expect(outcome.result.skills).toContain("typescript");
    expect(outcome.result.remote).toBe(true);
    expect(outcome.model).toBe("gpt-5-mini-test");
  });

  it("throws on invalid JSON", async () => {
    const client = makeClient(
      async () => new Response(completionBody(HIRING_RESULT, "not json"), { status: 200 }),
    );
    await expect(classifyPost(client, INPUT)).rejects.toThrow();
  });

  it("throws when the response violates the schema", async () => {
    const client = makeClient(
      async () =>
        new Response(completionBody({ isHiring: "yes", confidence: 500 }), { status: 200 }),
    );
    await expect(classifyPost(client, INPUT)).rejects.toThrow();
  });
});

describe("classifyMany", () => {
  it("classifies every input and preserves order", async () => {
    const client = makeClient(
      async () => new Response(completionBody(HIRING_RESULT), { status: 200 }),
    );
    const inputs = Array.from({ length: 6 }, (_, i) => ({
      ...INPUT,
      postId: `p${i}`,
      text: `post number ${i} text`,
    }));
    const outcomes = await classifyMany(client, inputs, { concurrency: 2 });
    expect(outcomes).toHaveLength(6);
    for (let i = 0; i < inputs.length; i += 1) {
      expect(isClassificationOutcome(outcomes[i]!)).toBe(true);
      expect(outcomes[i]?.input.postId).toBe(`p${i}`);
    }
  });

  it("captures per-post failures without failing the batch", async () => {
    const client = makeClient(async (init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const user = body.messages.at(-1)?.content ?? "";
      return user.includes("boom")
        ? new Response("bad", { status: 400 })
        : new Response(completionBody(HIRING_RESULT), { status: 200 });
    });
    const outcomes = await classifyMany(client, [
      { ...INPUT, postId: "ok" },
      { ...INPUT, postId: "boom-post", text: "this one will boom" },
      { ...INPUT, postId: "ok2" },
    ]);
    expect(outcomes[0]?.input.postId).toBe("ok");
    expect(isClassificationOutcome(outcomes[0]!)).toBe(true);
    expect(isClassificationOutcome(outcomes[1]!)).toBe(false);
    expect("error" in (outcomes[1] as { error: string })).toBe(true);
    expect(outcomes[2]?.input.postId).toBe("ok2");
  });
});

// ---------------------------------------------------------------------------
// applyClassifications (integration)
// ---------------------------------------------------------------------------

describe("applyClassifications (integration)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    prisma = createPrismaClient();
    await prisma.$connect();
    await prisma.classification.deleteMany();
    await prisma.linkedInPost.deleteMany();
  });

  afterAll(async () => {
    await prisma.classification.deleteMany();
    await prisma.linkedInPost.deleteMany();
    await prisma.$disconnect();
  });

  it("creates Classification rows and upgrades LinkedInPost fields", async () => {
    const seeded = await prisma.linkedInPost.create({
      data: {
        contentHash: contentHash(INPUT.text),
        text: INPUT.text,
        authorName: INPUT.authorName,
        searchQuery: "React Native",
        isHiring: true,
        confidence: 85,
        matchedBy: "keyword",
      },
    });

    const outcome = {
      input: INPUT,
      result: HIRING_RESULT,
      model: "gpt-5-mini-test",
      latencyMs: 321,
      inputTokens: 120,
      outputTokens: 40,
    };

    const result = await applyClassifications(prisma, {
      outcomes: [outcome],
      model: "gpt-5-mini-test",
    });

    expect(result.classified).toBe(1);
    expect(result.hiring).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.latencyMs).toBe(321);

    const updated = await prisma.linkedInPost.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(updated.isHiring).toBe(true);
    expect(updated.matchedBy).toBe("ai");
    expect(updated.confidence).toBe(90);
    expect(updated.role).toBe("Senior React Native Engineer");
    expect(updated.location).toBe("Berlin");
    expect(updated.remote).toBe(true);
    expect(updated.skills).toContain("typescript");
    expect(updated.salaryMentioned).toBe("$120k-$150k");

    const row = await prisma.classification.findFirstOrThrow({
      where: { postId: seeded.id },
    });
    expect(row.provider).toBe("openai");
    expect(row.model).toBe("gpt-5-mini-test");
    expect(row.promptVersion).toBe("1");
    expect(row.isHiring).toBe(true);
    expect(row.confidence).toBe(90);
    expect(row.inputTokens).toBe(120);
    expect(row.outputTokens).toBe(40);
  });

  it("overrides heuristic hiring when the AI disagrees", async () => {
    const seeded = await prisma.linkedInPost.create({
      data: {
        contentHash: contentHash("Celebrating our new hire this week."),
        text: "Celebrating our new hire this week.",
        searchQuery: "hiring",
        isHiring: true,
        confidence: 85,
        matchedBy: "keyword",
      },
    });

    const outcome = {
      input: { ...INPUT, text: "Celebrating our new hire this week." },
      result: { ...HIRING_RESULT, isHiring: false, confidence: 30, role: "" },
      model: "gpt-5-mini-test",
      latencyMs: 150,
      inputTokens: 100,
      outputTokens: 20,
    };

    const result = await applyClassifications(prisma, {
      outcomes: [outcome],
      model: "gpt-5-mini-test",
    });
    expect(result.hiring).toBe(0);

    const updated = await prisma.linkedInPost.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(updated.isHiring).toBe(false);
    expect(updated.matchedBy).toBeNull();
    expect(updated.confidence).toBe(30);
  });
});
