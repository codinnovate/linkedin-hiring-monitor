-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'DISCORD', 'EMAIL', 'FIREBASE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('IDLE', 'BUSY', 'OFFLINE', 'ERROR');

-- CreateEnum
CREATE TYPE "SearchRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "keywords" TEXT[],
    "location" TEXT,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linkedin_post" (
    "id" TEXT NOT NULL,
    "liPostId" TEXT,
    "url" TEXT,
    "contentHash" TEXT NOT NULL,
    "authorName" TEXT,
    "authorProfileUrl" TEXT,
    "authorHeadline" TEXT,
    "company" TEXT,
    "text" TEXT NOT NULL,
    "images" TEXT[],
    "videoUrl" TEXT,
    "postedAtLabel" TEXT,
    "postedAt" TIMESTAMP(3),
    "likes" INTEGER,
    "comments" INTEGER,
    "reposts" INTEGER,
    "followers" INTEGER,
    "searchQuery" TEXT,
    "source" TEXT NOT NULL DEFAULT 'linkedin-search',
    "isHiring" BOOLEAN NOT NULL DEFAULT false,
    "confidence" INTEGER,
    "role" TEXT,
    "location" TEXT,
    "remote" BOOLEAN,
    "skills" TEXT[],
    "employmentType" TEXT,
    "salaryMentioned" TEXT,
    "classificationReason" TEXT,
    "matchedBy" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linkedin_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL DEFAULT '1',
    "isHiring" BOOLEAN NOT NULL,
    "confidence" INTEGER,
    "role" TEXT,
    "company" TEXT,
    "location" TEXT,
    "remote" BOOLEAN,
    "skills" TEXT[],
    "employmentType" TEXT,
    "salaryMentioned" TEXT,
    "reason" TEXT,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_index" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "sourcePostId" TEXT,
    "similarity" DOUBLE PRECISION,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "searchId" TEXT,
    "postId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'playwright',
    "status" "WorkerStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastHeartbeat" TIMESTAMP(3),
    "currentUrl" TEXT,
    "lastJobId" TEXT,
    "jobsCompleted" INTEGER NOT NULL DEFAULT 0,
    "jobsFailed" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_run" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "status" "SearchRunStatus" NOT NULL DEFAULT 'SUCCESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "postsFound" INTEGER NOT NULL DEFAULT 0,
    "postsNew" INTEGER NOT NULL DEFAULT 0,
    "postsHiring" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "error" TEXT,

    CONSTRAINT "search_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_identifier_value_key" ON "verification"("identifier", "value");

-- CreateIndex
CREATE INDEX "search_enabled_idx" ON "search"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "search_userId_query_key" ON "search"("userId", "query");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_value_key" ON "keyword"("value");

-- CreateIndex
CREATE INDEX "keyword_active_idx" ON "keyword"("active");

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_post_liPostId_key" ON "linkedin_post"("liPostId");

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_post_url_key" ON "linkedin_post"("url");

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_post_contentHash_key" ON "linkedin_post"("contentHash");

-- CreateIndex
CREATE INDEX "linkedin_post_isHiring_confidence_idx" ON "linkedin_post"("isHiring", "confidence");

-- CreateIndex
CREATE INDEX "linkedin_post_seenAt_idx" ON "linkedin_post"("seenAt");

-- CreateIndex
CREATE INDEX "linkedin_post_postedAt_idx" ON "linkedin_post"("postedAt");

-- CreateIndex
CREATE INDEX "linkedin_post_createdAt_idx" ON "linkedin_post"("createdAt");

-- CreateIndex
CREATE INDEX "classification_postId_idx" ON "classification"("postId");

-- CreateIndex
CREATE INDEX "classification_createdAt_idx" ON "classification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_index_sha256_key" ON "duplicate_index"("sha256");

-- CreateIndex
CREATE INDEX "duplicate_index_detectedAt_idx" ON "duplicate_index"("detectedAt");

-- CreateIndex
CREATE INDEX "notification_userId_status_idx" ON "notification"("userId", "status");

-- CreateIndex
CREATE INDEX "notification_postId_idx" ON "notification"("postId");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_userId_channel_key" ON "notification_preference"("userId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "worker_name_key" ON "worker"("name");

-- CreateIndex
CREATE INDEX "worker_status_idx" ON "worker"("status");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "search_run_searchId_startedAt_idx" ON "search_run"("searchId", "startedAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search" ADD CONSTRAINT "search_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification" ADD CONSTRAINT "classification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "linkedin_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_index" ADD CONSTRAINT "duplicate_index_postId_fkey" FOREIGN KEY ("postId") REFERENCES "linkedin_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "search"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "linkedin_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_run" ADD CONSTRAINT "search_run_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "search"("id") ON DELETE CASCADE ON UPDATE CASCADE;
