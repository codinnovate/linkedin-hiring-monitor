import { classificationResultSchema, contentHash } from "@lhm/shared";
import type { ClassificationResult, ClassifyRequest } from "@lhm/shared";
import type { Prisma, PrismaClient } from "@lhm/database";
import type { Logger } from "pino";
import type { OpenAiClient } from "./client.js";
import {
  buildClassificationUserPrompt,
  CLASSIFICATION_PROMPT_VERSION,
  CLASSIFICATION_SYSTEM_PROMPT,
} from "./prompts.js";

/** How many OpenAI requests run concurrently per batch. */
const DEFAULT_CONCURRENCY = 5;

export type ClassifyInput = ClassifyRequest;

export interface ClassificationOutcome {
  input: ClassifyInput;
  result: ClassificationResult;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ClassificationFailure {
  input: ClassifyInput;
  error: string;
}

export type ClassifyOutcome = ClassificationOutcome | ClassificationFailure;

export function isClassificationOutcome(
  outcome: ClassifyOutcome,
): outcome is ClassificationOutcome {
  return "result" in outcome;
}

/** Classifies a single post; throws on transport, parse, or validation errors. */
export async function classifyPost(
  client: OpenAiClient,
  input: ClassifyInput,
): Promise<ClassificationOutcome> {
  const completion = await client.complete([
    { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
    { role: "user", content: buildClassificationUserPrompt(input) },
  ]);

  const parsed = JSON.parse(completion.content) as unknown;
  const result = classificationResultSchema.parse(parsed);

  return {
    input,
    result,
    model: completion.model,
    latencyMs: completion.latencyMs,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
}

/**
 * Classifies a batch of posts with bounded concurrency. Individual failures
 * are captured per post so one bad response never fails the whole batch.
 */
export async function classifyMany(
  client: OpenAiClient,
  inputs: ClassifyInput[],
  options: { concurrency?: number; logger?: Logger } = {},
): Promise<ClassifyOutcome[]> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const outcomes: ClassifyOutcome[] = new Array(inputs.length);

  await runWithConcurrency(inputs, concurrency, async (input, index) => {
    try {
      outcomes[index] = await classifyPost(client, input);
    } catch (error) {
      options.logger?.warn(
        { index, error: error instanceof Error ? error.message : String(error) },
        "ai classification failed for post",
      );
      outcomes[index] = {
        input,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  return outcomes;
}

export interface ApplyClassificationsInput {
  /** Outcomes already reduced to successful ones. */
  outcomes: ClassificationOutcome[];
  model: string;
}

export interface ApplyClassificationsResult {
  classified: number;
  hiring: number;
  failed: number;
  latencyMs: number;
}

/**
 * Writes AI results: one `Classification` row per post plus an in-place
 * upgrade of the heuristic fields on `LinkedInPost`. Rows are looked up by
 * content hash of the post text; outcomes without a matching row are dropped.
 */
export async function applyClassifications(
  prisma: PrismaClient,
  inputs: ApplyClassificationsInput,
): Promise<ApplyClassificationsResult> {
  const { outcomes, model } = inputs;
  if (outcomes.length === 0) {
    return { classified: 0, hiring: 0, failed: 0, latencyMs: 0 };
  }

  const hashes = outcomes.map((outcome) => contentHash(outcome.input.text));
  const rows = await prisma.linkedInPost.findMany({
    where: { contentHash: { in: hashes } },
    select: { id: true, contentHash: true },
  });
  const idByHash = new Map(rows.map((row) => [row.contentHash, row.id]));

  const toCreate: Array<{
    postId: string;
    provider: string;
    model: string;
    promptVersion: string;
    isHiring: boolean;
    confidence: number | null;
    role: string | null;
    company: string | null;
    location: string | null;
    remote: boolean | null;
    skills: string[];
    employmentType: string | null;
    salaryMentioned: string | null;
    reason: string | null;
    latencyMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  }> = [];
  const updates: Array<{ id: string; data: Prisma.LinkedInPostUpdateInput }> = [];

  let classified = 0;
  let hiring = 0;
  for (const outcome of outcomes) {
    const postId = idByHash.get(contentHash(outcome.input.text));
    if (!postId) continue;
    classified += 1;
    if (outcome.result.isHiring) hiring += 1;

    const { result, latencyMs, inputTokens, outputTokens } = outcome;
    toCreate.push({
      postId,
      provider: "openai",
      model,
      promptVersion: CLASSIFICATION_PROMPT_VERSION,
      isHiring: result.isHiring,
      confidence: result.confidence,
      role: result.role || null,
      company: result.company || null,
      location: result.location || null,
      remote: result.remote,
      skills: result.skills,
      employmentType: result.employmentType || null,
      salaryMentioned: result.salaryMentioned || null,
      reason: result.reason || null,
      latencyMs,
      inputTokens,
      outputTokens,
    });

    updates.push({
      id: postId,
      data: {
        isHiring: result.isHiring,
        confidence: result.confidence,
        role: result.role || null,
        location: result.location || null,
        remote: result.remote,
        skills: result.skills,
        employmentType: result.employmentType || null,
        salaryMentioned: result.salaryMentioned || null,
        classificationReason: result.reason || null,
        matchedBy: result.isHiring ? "ai" : null,
      },
    });
  }

  if (toCreate.length > 0) {
    await prisma.classification.createMany({ data: toCreate, skipDuplicates: true });
  }
  for (const update of updates) {
    await prisma.linkedInPost.update({ where: { id: update.id }, data: update.data });
  }

  const latencyMs = outcomes.reduce((sum, outcome) => sum + outcome.latencyMs, 0);

  return { classified, hiring, failed: outcomes.length - classified, latencyMs };
}
