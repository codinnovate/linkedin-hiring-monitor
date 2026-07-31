import { contentHash, similarity } from "@lhm/shared";
import type { RawPost } from "@lhm/shared";
import type { PrismaClient } from "@lhm/database";
import { heuristicClassifyPost } from "../extraction/classify.js";

/** Near-duplicate threshold; matches the shared `isNearDuplicate` default. */
const NEAR_DUPLICATE_THRESHOLD = 0.85;
/** Only posts newer than this are near-duplicate candidates. */
const DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Bounds the similarity comparison cost per batch. */
const MAX_DEDUPE_CANDIDATES = 500;
const INSERT_CHUNK_SIZE = 200;

export interface PersistPostsInput {
  posts: RawPost[];
  now?: Date;
}

export interface PersistPostsResult {
  inserted: number;
  hiringInserted: number;
  exactDuplicates: number;
  nearDuplicates: number;
  failed: number;
  /** The raw posts that were actually inserted (candidates for AI). */
  insertedPosts: RawPost[];
}

interface ClassifiedPost {
  post: RawPost;
  contentHash: string;
  classification: ReturnType<typeof heuristicClassifyPost>;
}

function classifyPosts(posts: RawPost[]): ClassifiedPost[] {
  return posts.map((post) => ({
    post,
    contentHash: contentHash(post.text),
    classification: heuristicClassifyPost(post),
  }));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Persists extracted posts with three layers of deduplication:
 *
 * 1. In-batch: identical content hashes within one extraction pass.
 * 2. Exact: existing `liPostId`, `url`, or `contentHash` in the database.
 * 3. Similarity: content that looks like a recent repost (recorded in
 *    `DuplicateIndex` for audit).
 *
 * Heuristic hiring classifications are stored on the row so later phases
 * (AI reclassification, notifications) can filter on them.
 */
export async function persistPosts(
  prisma: PrismaClient,
  input: PersistPostsInput,
): Promise<PersistPostsResult> {
  const now = input.now ?? new Date();
  const classified = classifyPosts(input.posts);

  // Layer 1: in-batch content dedupe keeps the first occurrence.
  const uniqueByHash = new Map<string, ClassifiedPost>();
  for (const entry of classified) {
    if (!uniqueByHash.has(entry.contentHash)) uniqueByHash.set(entry.contentHash, entry);
  }
  const unique = [...uniqueByHash.values()];

  const liPostIds = unique
    .map((entry) => entry.post.liPostId)
    .filter((id): id is string => Boolean(id));
  const urls = unique.map((entry) => entry.post.url).filter((url): url is string => Boolean(url));
  const hashes = unique.map((entry) => entry.contentHash);

  // Layer 2: exact duplicates against existing rows.
  const existing = await prisma.linkedInPost.findMany({
    where: {
      OR: [{ liPostId: { in: liPostIds } }, { url: { in: urls } }, { contentHash: { in: hashes } }],
    },
    select: { liPostId: true, url: true, contentHash: true },
  });
  const existingLiIds = new Set(existing.map((row) => row.liPostId).filter(Boolean));
  const existingUrls = new Set(existing.map((row) => row.url).filter(Boolean));
  const existingHashes = new Set(existing.map((row) => row.contentHash));

  let exactDuplicates = 0;
  const notExact = unique.filter((entry) => {
    const { post } = entry;
    if (
      (post.liPostId && existingLiIds.has(post.liPostId)) ||
      (post.url && existingUrls.has(post.url)) ||
      existingHashes.has(entry.contentHash)
    ) {
      exactDuplicates += 1;
      return false;
    }
    return true;
  });

  // Layer 3: similarity duplicates against recent posts.
  const candidates = await prisma.linkedInPost.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - DEDUPE_WINDOW_MS) } },
    select: { id: true, text: true },
    orderBy: { createdAt: "desc" },
    take: MAX_DEDUPE_CANDIDATES,
  });

  const nearDuplicates: Array<{ postId: string; sha256: string; similarity: number }> = [];
  let nearDuplicateCount = 0;
  const toInsert = notExact.filter((entry) => {
    for (const candidate of candidates) {
      const score = similarity(entry.post.text, candidate.text);
      if (score >= NEAR_DUPLICATE_THRESHOLD) {
        nearDuplicateCount += 1;
        nearDuplicates.push({
          postId: candidate.id,
          sha256: entry.contentHash,
          similarity: Math.round(score * 100) / 100,
        });
        return false;
      }
    }
    return true;
  });

  if (nearDuplicates.length > 0) {
    await prisma.duplicateIndex
      .createMany({
        data: nearDuplicates.map((row) => ({
          postId: row.postId,
          sha256: row.sha256,
          method: "similarity",
          similarity: row.similarity,
        })),
        skipDuplicates: true,
      })
      .catch(() => {});
  }

  // Persist new rows in chunks; skipDuplicates tolerates concurrent inserts.
  const rows = toInsert.map(({ post, contentHash: hash, classification }) => ({
    liPostId: post.liPostId ?? null,
    url: post.url ?? null,
    contentHash: hash,
    authorName: post.authorName ?? null,
    authorProfileUrl: post.authorProfileUrl ?? null,
    authorHeadline: post.authorHeadline ?? null,
    company: post.company ?? null,
    text: post.text,
    images: post.images,
    videoUrl: post.videoUrl ?? null,
    postedAtLabel: post.postedAtLabel ?? null,
    postedAt: post.postedAt ? new Date(post.postedAt) : null,
    likes: post.likes ?? null,
    comments: post.comments ?? null,
    reposts: post.reposts ?? null,
    followers: post.followers ?? null,
    searchQuery: post.searchQuery ?? null,
    isHiring: classification?.isHiring ?? false,
    confidence: classification?.confidence ?? null,
    role: classification?.role ?? null,
    skills: classification?.skills ?? [],
    classificationReason: classification?.reason ?? null,
    matchedBy: classification?.matchedBy ?? null,
    seenAt: now,
  }));

  let inserted = 0;
  let failed = 0;
  for (const batch of chunk(rows, INSERT_CHUNK_SIZE)) {
    try {
      const result = await prisma.linkedInPost.createMany({ data: batch, skipDuplicates: true });
      inserted += result.count;
    } catch {
      failed += batch.length;
    }
  }

  const hiringInserted = toInsert.filter((entry) => entry.classification?.isHiring).length;

  return {
    inserted,
    hiringInserted,
    exactDuplicates,
    nearDuplicates: nearDuplicateCount,
    failed,
    insertedPosts: toInsert.map((entry) => entry.post),
  };
}
