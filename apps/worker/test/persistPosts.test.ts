import { contentHash } from "@lhm/shared";
import type { RawPost } from "@lhm/shared";
import { createPrismaClient } from "@lhm/database";
import type { PrismaClient } from "@lhm/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { persistPosts } from "../src/storage/persistPosts.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://lhm:lhm_password@localhost:5432/lhm_test?schema=public";

function makePost(overrides: Partial<RawPost>): RawPost {
  return {
    liPostId: "9000000000000000000",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:9000000000000000000/",
    authorName: "Jane Doe",
    authorProfileUrl: "https://www.linkedin.com/in/jane-doe/",
    text: "We're hiring a React Native Engineer! Apply here.",
    images: [],
    searchQuery: "React Native",
    ...overrides,
  };
}

describe("persistPosts (integration)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    prisma = createPrismaClient();
    await prisma.$connect();
    await prisma.duplicateIndex.deleteMany();
    await prisma.linkedInPost.deleteMany();
  });

  afterAll(async () => {
    await prisma.duplicateIndex.deleteMany();
    await prisma.linkedInPost.deleteMany();
    await prisma.$disconnect();
  });

  it("inserts new posts and stores heuristic hiring classification", async () => {
    const result = await persistPosts(prisma, {
      posts: [
        makePost({
          liPostId: "9001",
          url: "https://www.linkedin.com/feed/update/urn:li:activity:9001/",
          text: "We're hiring a Senior React Native Engineer! Join our team.",
        }),
        makePost({
          liPostId: "9002",
          url: "https://www.linkedin.com/feed/update/urn:li:activity:9002/",
          text: "Just sharing our Q3 roadmap for the mobile team.",
        }),
      ],
    });

    expect(result.inserted).toBe(2);
    expect(result.hiringInserted).toBe(1);
    expect(result.exactDuplicates).toBe(0);
    expect(result.nearDuplicates).toBe(0);

    const hiring = await prisma.linkedInPost.findUniqueOrThrow({ where: { liPostId: "9001" } });
    expect(hiring.isHiring).toBe(true);
    expect(hiring.confidence).toBe(85);
    expect(hiring.matchedBy).toBe("keyword");
    expect(hiring.role).toBe("Senior React Native Engineer");
    expect(hiring.skills).toContain("react native");
    expect(hiring.contentHash).toBe(
      contentHash("We're hiring a Senior React Native Engineer! Join our team."),
    );

    const normal = await prisma.linkedInPost.findUniqueOrThrow({ where: { liPostId: "9002" } });
    expect(normal.isHiring).toBe(false);
  });

  it("deduplicates exact matches on a second run", async () => {
    const result = await persistPosts(prisma, {
      posts: [
        makePost({
          liPostId: "9001",
          url: "https://www.linkedin.com/feed/update/urn:li:activity:9001/",
          text: "We're hiring a Senior React Native Engineer! Join our team.",
        }),
      ],
    });

    expect(result.inserted).toBe(0);
    expect(result.exactDuplicates).toBe(1);
    expect(result.hiringInserted).toBe(0);
  });

  it("skips near-duplicate reposts and records the similarity audit row", async () => {
    const repost = "We are hiring a Senior React Native Engineer! Join our team.";

    const result = await persistPosts(prisma, {
      posts: [
        makePost({
          liPostId: "9003",
          url: "https://www.linkedin.com/feed/update/urn:li:activity:9003/",
          text: repost,
        }),
      ],
    });

    expect(result.inserted).toBe(0);
    expect(result.nearDuplicates).toBe(1);
    expect(result.exactDuplicates).toBe(0);

    const audit = await prisma.duplicateIndex.findMany({ where: { method: "similarity" } });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0]?.sha256).toBe(contentHash(repost));
    expect(audit[0]?.similarity).toBeGreaterThanOrEqual(0.85);
  });

  it("deduplicates identical content within a single batch", async () => {
    const text = "We are hiring for a backend role, remote. DM me if interested.";
    const result = await persistPosts(prisma, {
      posts: [
        makePost({
          liPostId: "9004",
          url: "https://www.linkedin.com/feed/update/urn:li:activity:9004/",
          text,
        }),
        makePost({
          liPostId: "9005",
          url: "https://www.linkedin.com/feed/update/urn:li:activity:9005/",
          text,
        }),
      ],
    });

    expect(result.inserted).toBe(1);
    const count = await prisma.linkedInPost.count({
      where: { contentHash: contentHash(text) },
    });
    expect(count).toBe(1);
  });
});
