import { z } from "zod";

/**
 * A raw post as extracted from a LinkedIn search results page.
 * All fields are best-effort; most are optional because LinkedIn's
 * DOM varies between sessions and experiments.
 */
export const rawPostSchema = z.object({
  /** LinkedIn's internal post URN suffix, e.g. "urn:li:activity:7123456789012345678". */
  liPostId: z.string().trim().optional(),
  /** Absolute URL to the post on linkedin.com. */
  url: z.string().trim().min(1).optional(),
  authorName: z.string().trim().optional(),
  authorProfileUrl: z.string().trim().optional(),
  authorHeadline: z.string().trim().optional(),
  company: z.string().trim().optional(),
  /** Visible body of the post. */
  text: z.string().trim().min(1),
  images: z.array(z.string().trim().min(1)).default([]),
  videoUrl: z.string().trim().optional(),
  /** Human readable LinkedIn timestamp label, e.g. "3h", "1w". */
  postedAtLabel: z.string().trim().optional(),
  /** Parsed timestamp when the post was published. */
  postedAt: z.iso.datetime().optional(),
  likes: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  reposts: z.number().int().nonnegative().optional(),
  followers: z.number().int().nonnegative().optional(),
  /** The search query that surfaced this post. */
  searchQuery: z.string().trim().optional(),
});

export type RawPost = z.infer<typeof rawPostSchema>;

/**
 * A post that was classified as a hiring announcement and persisted.
 * Merges extraction data with AI classification data.
 */
export const hiringPostSchema = rawPostSchema
  .extend({
    id: z.string().min(1),
    isHiring: z.literal(true),
    confidence: z.number().int().min(0).max(100),
    role: z.string().optional(),
    remote: z.boolean().nullable().optional(),
    skills: z.array(z.string()).default([]),
    employmentType: z.string().optional(),
    salaryMentioned: z.string().optional(),
    classificationReason: z.string().optional(),
    matchedBy: z.enum(["ai", "keyword", "semantic"]).optional(),
  })
  .omit({ text: true })
  .extend({ text: z.string().min(1) });

export type HiringPost = z.infer<typeof hiringPostSchema>;
