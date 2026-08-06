-- AlterTable: Add environment and lastAuthorizedAt to marketplace_accounts
ALTER TABLE "marketplace_accounts" ADD COLUMN IF NOT EXISTS "environment" TEXT DEFAULT 'sandbox';
ALTER TABLE "marketplace_accounts" ADD COLUMN IF NOT EXISTS "lastAuthorizedAt" TIMESTAMP(3);

-- CreateTable: marketplace_oauth_states
CREATE TABLE IF NOT EXISTS "marketplace_oauth_states" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'shopee',
    "stateHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "returnUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "metadataJson" TEXT,

    CONSTRAINT "marketplace_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_oauth_states_stateHash_key" ON "marketplace_oauth_states"("stateHash");
CREATE INDEX IF NOT EXISTS "marketplace_oauth_states_expiresAt_idx" ON "marketplace_oauth_states"("expiresAt");
CREATE INDEX IF NOT EXISTS "marketplace_oauth_states_organizationId_idx" ON "marketplace_oauth_states"("organizationId");
CREATE INDEX IF NOT EXISTS "marketplace_oauth_states_userId_idx" ON "marketplace_oauth_states"("userId");
