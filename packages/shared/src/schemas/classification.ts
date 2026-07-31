import { z } from "zod";

/**
 * JSON shape returned by the AI classification prompt.
 * See apps/worker/src/ai/prompts.ts for the exact prompt that
 * requests this shape.
 */
export const classificationResultSchema = z.object({
  isHiring: z.boolean(),
  confidence: z.number().int().min(0).max(100),
  role: z.string().default(""),
  company: z.string().default(""),
  location: z.string().default(""),
  remote: z.boolean().nullable().default(null),
  skills: z.array(z.string()).default([]),
  employmentType: z.string().default(""),
  salaryMentioned: z.string().default(""),
  reason: z.string().default(""),
});

export type ClassificationResult = z.infer<typeof classificationResultSchema>;

/** How the system decided a post is a hiring announcement. */
export const matchSourceSchema = z.enum(["ai", "keyword", "semantic"]);
export type MatchSource = z.infer<typeof matchSourceSchema>;

/** How a duplicate was detected. */
export const dedupeMethodSchema = z.enum(["postId", "url", "contentHash", "similarity"]);
export type DedupeMethod = z.infer<typeof dedupeMethodSchema>;

export interface ClassifyRequest {
  postId: string;
  text: string;
  authorName?: string;
  authorHeadline?: string;
  company?: string;
}
