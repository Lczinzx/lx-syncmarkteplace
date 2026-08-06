-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "marketplace_accounts" ADD COLUMN "lastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "marketplace_listings" ADD COLUMN "firstMissingAt" TIMESTAMP(3),
ADD COLUMN "lastMissingAt" TIMESTAMP(3),
ADD COLUMN "missingSyncCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "marketplace_variations" ADD COLUMN "firstMissingAt" TIMESTAMP(3),
ADD COLUMN "lastMissingAt" TIMESTAMP(3),
ADD COLUMN "missingSyncCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "marketplace_sync_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketplaceAccountId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "syncType" "SyncType" NOT NULL DEFAULT 'INCREMENTAL',
    "status" "SyncRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "currentStage" TEXT,
    "currentCursor" TEXT,
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "listingsFound" INTEGER NOT NULL DEFAULT 0,
    "listingsCreated" INTEGER NOT NULL DEFAULT 0,
    "listingsUpdated" INTEGER NOT NULL DEFAULT 0,
    "listingsUnchanged" INTEGER NOT NULL DEFAULT 0,
    "listingsMissingRemotely" INTEGER NOT NULL DEFAULT 0,
    "variationsCreated" INTEGER NOT NULL DEFAULT 0,
    "variationsUpdated" INTEGER NOT NULL DEFAULT 0,
    "variationsUnchanged" INTEGER NOT NULL DEFAULT 0,
    "imagesCreated" INTEGER NOT NULL DEFAULT 0,
    "imagesUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummaryJson" TEXT,
    "initiatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketplace_sync_runs_organizationId_idx" ON "marketplace_sync_runs"("organizationId");

-- CreateIndex
CREATE INDEX "marketplace_sync_runs_marketplaceAccountId_idx" ON "marketplace_sync_runs"("marketplaceAccountId");

-- CreateIndex
CREATE INDEX "marketplace_sync_runs_status_idx" ON "marketplace_sync_runs"("status");

-- CreateIndex
CREATE INDEX "marketplace_sync_runs_startedAt_idx" ON "marketplace_sync_runs"("startedAt");

-- AddForeignKey
ALTER TABLE "marketplace_sync_runs" ADD CONSTRAINT "marketplace_sync_runs_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
