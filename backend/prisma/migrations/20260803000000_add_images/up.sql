-- Migration para adicionar imagens ao MarketplaceListing e MarketplaceVariation

BEGIN;

-- Adiciona a coluna imagesJson na tabela marketplace_listings (nullable JSON)
ALTER TABLE "marketplace_listings" ADD COLUMN "imagesJson" TEXT;

-- Adiciona a coluna imageUrl na tabela marketplace_variations (nullable TEXT)
ALTER TABLE "marketplace_variations" ADD COLUMN "imageUrl" TEXT;

COMMIT;
