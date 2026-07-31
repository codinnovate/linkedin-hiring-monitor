import { z } from "zod";

export const searchCreateSchema = z.object({
  query: z.string().trim().min(2).max(200),
  keywords: z.array(z.string().trim().min(1)).max(50).default([]),
  location: z.string().trim().max(100).optional(),
  intervalMinutes: z.number().int().min(5).max(1440).default(15),
  enabled: z.boolean().default(true),
});

export type SearchCreateInput = z.infer<typeof searchCreateSchema>;

export const searchUpdateSchema = searchCreateSchema.partial();
export type SearchUpdateInput = z.infer<typeof searchUpdateSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const postListQuerySchema = paginationQuerySchema.extend({
  isHiring: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  remote: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
  q: z.string().trim().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type PostListQuery = z.infer<typeof postListQuerySchema>;
