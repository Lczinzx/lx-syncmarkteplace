-- AlterTable: Adiciona campos nullable de imagem nas tabelas existentes
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "imagesJson" TEXT;

ALTER TABLE "marketplace_variations" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

ALTER TABLE "master_products" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- CreateTable: Tabela normalizada de galeria de imagens de anúncios
CREATE TABLE IF NOT EXISTS "marketplace_listing_images" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketplaceListingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "altText" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'UPLOAD',
    "externalImageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_listing_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_listing_images_organizationId_idx" ON "marketplace_listing_images"("organizationId");
CREATE INDEX IF NOT EXISTS "marketplace_listing_images_marketplaceListingId_idx" ON "marketplace_listing_images"("marketplaceListingId");
CREATE INDEX IF NOT EXISTS "marketplace_listing_images_position_idx" ON "marketplace_listing_images"("position");
CREATE INDEX IF NOT EXISTS "marketplace_listing_images_isPrimary_idx" ON "marketplace_listing_images"("isPrimary");
CREATE INDEX IF NOT EXISTS "marketplace_listing_images_storageKey_idx" ON "marketplace_listing_images"("storageKey");

-- AddForeignKey
ALTER TABLE "marketplace_listing_images" DROP CONSTRAINT IF EXISTS "marketplace_listing_images_marketplaceListingId_fkey";
ALTER TABLE "marketplace_listing_images" ADD CONSTRAINT "marketplace_listing_images_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
