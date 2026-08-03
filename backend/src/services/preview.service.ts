import crypto from 'node:crypto';
import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';
import { applySkuTransformation, TransformationRule } from './transformation.service.js';

export type SelectionScope =
  | 'SINGLE_LISTING'
  | 'SINGLE_VARIATION'
  | 'SELECTED_LISTINGS'
  | 'SELECTED_VARIATIONS'
  | 'ALL_FILTERED'
  | 'ALL_ACTIVE'
  | 'SPECIFIC_ACCOUNTS'
  | 'SPECIFIC_MARKETPLACES'
  | 'SPECIFIC_SKUS'
  | 'MASTER_PRODUCT'
  | 'SYNC_GROUP';

export interface SelectionDefinition {
  scope: SelectionScope;
  filters?: {
    marketplaceAccountIds?: string[];
    marketplaces?: string[];
    statuses?: string[];
    skus?: string[];
    masterProductIds?: string[];
    search?: string;
    activeOnly?: boolean;
  };
  includedListingIds?: string[];
  excludedListingIds?: string[];
  includedVariationIds?: string[];
  excludedVariationIds?: string[];
  specificSkus?: string[];
}

export interface PreviewItemResult {
  listingId: string;
  variationId: string;
  externalListingId: string;
  externalVariationId: string;
  marketplace: string;
  accountName: string;
  listingTitle: string;
  variationName: string;
  oldSku: string;
  newSku: string;
  status: 'VALID' | 'NO_CHANGE' | 'BLOCKED' | 'WARNING';
  reason?: string;
}

export interface PreviewSummary {
  previewId: string;
  previewHash: string;
  expiresAt: string;
  totalFound: number;
  totalValid: number;
  totalNoChange: number;
  totalBlocked: number;
  totalWarnings: number;
  items: PreviewItemResult[];
}

export class PreviewService {
  /**
   * Gera pré-visualização imutável para alteração em lote de SKUs
   */
  static async generatePreview(
    organizationId: string,
    selection: SelectionDefinition,
    rule: TransformationRule,
    allListings: Array<{
      id: string;
      organizationId: string;
      marketplaceAccountId: string;
      marketplace: string;
      accountName: string;
      externalListingId: string;
      title: string;
      status: string;
      variations: Array<{
        id: string;
        externalVariationId: string;
        variationName: string;
        currentSku: string;
        status: string;
      }>;
    }>
  ): Promise<PreviewSummary> {
    const previewId = `prev-${Date.now()}`;
    const adapter = new FakeMarketplaceAdapter();
    const capabilities = await adapter.getCapabilities();

    const items: PreviewItemResult[] = [];
    let totalValid = 0;
    let totalNoChange = 0;
    let totalBlocked = 0;
    let totalWarnings = 0;

    // Filtra anúncios por escopo da organização
    let targetListings = allListings.filter(l => l.organizationId === organizationId);

    if (selection.scope === 'ALL_ACTIVE' || selection.filters?.activeOnly) {
      targetListings = targetListings.filter(l => l.status === 'ACTIVE');
    }

    if (selection.filters?.marketplaceAccountIds?.length) {
      targetListings = targetListings.filter(l => selection.filters!.marketplaceAccountIds!.includes(l.marketplaceAccountId));
    }

    if (selection.filters?.marketplaces?.length) {
      targetListings = targetListings.filter(l => selection.filters!.marketplaces!.includes(l.marketplace));
    }

    for (const listing of targetListings) {
      for (const variation of listing.variations) {
        const oldSku = variation.currentSku;
        const proposedSku = applySkuTransformation(oldSku, rule);

        let itemStatus: PreviewItemResult['status'] = 'VALID';
        let reason = 'Pronto para atualização';

        if (!capabilities.canEditVariationSku && !capabilities.canEditListingSku) {
          itemStatus = 'BLOCKED';
          reason = `Marketplace ${listing.marketplace} não permite edição remota de SKU nesta variação`;
          totalBlocked++;
        } else if (proposedSku === oldSku) {
          itemStatus = 'NO_CHANGE';
          reason = 'O novo SKU é idêntico ao SKU atual (nenhuma alteração necessária)';
          totalNoChange++;
        } else if (!proposedSku || proposedSku.trim() === '') {
          itemStatus = 'BLOCKED';
          reason = 'SKU resultante não pode ser em branco';
          totalBlocked++;
        } else if (listing.status !== 'ACTIVE') {
          itemStatus = 'WARNING';
          reason = `Anúncio está com status (${listing.status})`;
          totalWarnings++;
          totalValid++;
        } else {
          totalValid++;
        }

        items.push({
          listingId: listing.id,
          variationId: variation.id,
          externalListingId: listing.externalListingId,
          externalVariationId: variation.externalVariationId,
          marketplace: listing.marketplace,
          accountName: listing.accountName,
          listingTitle: listing.title,
          variationName: variation.variationName,
          oldSku,
          newSku: proposedSku,
          status: itemStatus,
          reason
        });
      }
    }

    // Calcula Hash de Integridade SHA-256
    const hashData = JSON.stringify({ previewId, organizationId, rule, itemsCount: items.length });
    const previewHash = crypto.createHash('sha256').update(hashData).digest('hex');

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // Validade 30 minutos

    return {
      previewId,
      previewHash,
      expiresAt,
      totalFound: items.length,
      totalValid,
      totalNoChange,
      totalBlocked,
      totalWarnings,
      items
    };
  }
}
