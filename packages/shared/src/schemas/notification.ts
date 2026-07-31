import { z } from "zod";

export const notificationChannelSchema = z.enum(["TELEGRAM", "DISCORD", "EMAIL", "FIREBASE"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationStatusSchema = z.enum(["PENDING", "SENT", "FAILED", "SKIPPED"]);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

/** Payload used to render notifications across channels. */
export const notificationPayloadSchema = z.object({
  postId: z.string().min(1),
  postUrl: z.string().url().or(z.string().min(1)),
  role: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  remote: z.boolean().nullable().optional(),
  skills: z.array(z.string()).default([]),
  employmentType: z.string().optional(),
  confidence: z.number().int().min(0).max(100),
  postedBy: z.string().optional(),
  postedAtLabel: z.string().optional(),
  searchQuery: z.string().optional(),
  textSnippet: z.string().optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
