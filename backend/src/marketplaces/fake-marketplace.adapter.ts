import {
  MarketplaceAdapter,
  ConnectionResult,
  TokenRefreshResult,
  AccountInfo,
  ListListingsParams,
  ListingsResult,
  MarketplaceListingDTO,
  MarketplaceVariationDTO,
  MarketplaceSkuMatch,
  SkuValidationResult,
  ValidateSkuChangeParams,
  UpdateListingSkuParams,
  UpdateVariationSkuParams,
  MarketplaceUpdateResult,
  ConfirmSkuChangeParams,
  SkuConfirmationResult,
  UpdateStockParams,
  CreateListingParams,
  MarketplaceCreateResult,
  RateLimitStatus,
  MarketplaceCapabilities,
  NormalizedMarketplaceError
} from './marketplace-adapter.interface.js';
import { DemoListingSpec, generateDemoMarketplaceData } from './demo-data.js';

export class FakeMarketplaceAdapter implements MarketplaceAdapter {
  private marketplaceName: string;
  private accountId: string;
  public readonly isFakeAdapter = true;
  private dataset: DemoListingSpec[];

  constructor(marketplaceName = 'FakeMarketplace', accountId = 'fake-acc-123', dataset?: DemoListingSpec[]) {
    this.marketplaceName = marketplaceName;
    this.accountId = accountId;
    this.dataset = dataset || generateDemoMarketplaceData();
  }

  async connectAccount(): Promise<ConnectionResult> {
    return {
      success: true,
      accountId: this.accountId,
      sellerId: `FAKE_SELLER_${this.accountId}`,
      shopId: `SHOP_${this.accountId}`,
      accountName: `${this.marketplaceName} (Modo Simulado)`,
      accessToken: `mock_access_token_${Date.now()}`,
      refreshToken: `mock_refresh_token_${Date.now()}`,
      expiresIn: 21600,
      message: 'Conectado com sucesso em MODO DEMONSTRAÇÃO'
    };
  }

  async refreshAccessToken(): Promise<TokenRefreshResult> {
    return {
      success: true,
      accessToken: `mock_refreshed_token_${Date.now()}`,
      refreshToken: `mock_refreshed_refresh_token_${Date.now()}`,
      expiresIn: 21600,
      message: 'Token renovado em MODO DEMONSTRAÇÃO'
    };
  }

  async disconnectAccount(): Promise<void> {
    // No-op for fake adapter
    return Promise.resolve();
  }

  async getAccountInfo(): Promise<AccountInfo> {
    return {
      accountId: this.accountId,
      marketplace: this.marketplaceName,
      accountName: `${this.marketplaceName} (Modo Simulado)`,
      sellerId: `FAKE_SELLER_${this.accountId}`,
      status: 'CONNECTED',
      lastSyncAt: new Date()
    };
  }

  async listListings(params: ListListingsParams): Promise<ListingsResult> {
    let result = this.dataset.map((l): MarketplaceListingDTO => ({
      externalListingId: l.externalListingId,
      externalProductId: l.externalProductId,
      title: l.title,
      description: l.description,
      imageUrl: l.imageUrl,
      categoryId: l.categoryId,
      status: l.status,
      listingUrl: l.listingUrl
    }));

    if (params.status) {
      result = result.filter(l => l.status === params.status);
    }

    const page = params.page || 1;
    const limit = params.limit || result.length;
    const start = (page - 1) * limit;
    const paged = result.slice(start, start + limit);

    return {
      listings: paged,
      total: result.length,
      page,
      totalPages: Math.max(1, Math.ceil(result.length / limit))
    };
  }

  async getListing(externalListingId: string): Promise<MarketplaceListingDTO> {
    const found = this.dataset.find(l => l.externalListingId === externalListingId);
    if (!found) {
      throw new Error(`Anúncio ${externalListingId} não encontrado no marketplace simulado.`);
    }
    return {
      externalListingId: found.externalListingId,
      externalProductId: found.externalProductId,
      title: found.title,
      description: found.description,
      imageUrl: found.imageUrl,
      categoryId: found.categoryId,
      status: found.status,
      listingUrl: found.listingUrl
    };
  }

  async listVariations(externalListingId: string): Promise<MarketplaceVariationDTO[]> {
    const found = this.dataset.find(l => l.externalListingId === externalListingId);
    if (!found) return [];
    return found.variations.map(v => ({
      externalVariationId: v.externalVariationId,
      externalModelId: v.externalModelId,
      variationName: v.variationName,
      currentSku: v.currentSku,
      price: v.price,
      stock: v.stock,
      status: v.status,
      imageUrl: v.imageUrl || found.imageUrl
    }));
  }

  async findBySku(sku: string): Promise<MarketplaceSkuMatch[]> {
    if (!sku) return [];
    const matches: MarketplaceSkuMatch[] = [];
    for (const listing of this.dataset) {
      for (const v of listing.variations) {
        if (v.currentSku && v.currentSku.trim() === sku.trim()) {
          matches.push({
            externalListingId: listing.externalListingId,
            externalVariationId: v.externalVariationId,
            currentSku: v.currentSku,
            title: listing.title,
            variationName: v.variationName,
            marketplace: this.marketplaceName
          });
        }
      }
    }
    return matches;
  }

  async validateSku(sku: string): Promise<SkuValidationResult> {
    const clean = sku.trim();
    if (!clean) {
      return { valid: false, sku, message: 'SKU não pode ser vazio' };
    }
    if (clean.length < 3) {
      return { valid: false, sku, message: 'SKU deve ter no mínimo 3 caracteres' };
    }
    return { valid: true, sku, message: 'SKU válido em MODO DEMONSTRAÇÃO' };
  }

  async validateSkuChange(params: ValidateSkuChangeParams): Promise<SkuValidationResult> {
    if (params.oldSku === params.newSku) {
      return { valid: false, sku: params.newSku, message: 'O novo SKU é idêntico ao SKU atual' };
    }
    return { valid: true, sku: params.newSku, message: 'Pré-visualização da alteração aprovada em MODO DEMONSTRAÇÃO' };
  }

  async updateListingSku(params: UpdateListingSkuParams): Promise<MarketplaceUpdateResult> {
    return {
      success: true,
      externalListingId: params.externalListingId,
      oldSku: params.oldSku,
      newSku: params.newSku,
      updatedAt: new Date(),
      message: `[MODO DEMONSTRAÇÃO] SKU do anúncio ${params.externalListingId} alterado com sucesso de "${params.oldSku}" para "${params.newSku}".`
    };
  }

  async updateVariationSku(params: UpdateVariationSkuParams): Promise<MarketplaceUpdateResult> {
    return {
      success: true,
      externalListingId: params.externalListingId,
      externalVariationId: params.externalVariationId,
      oldSku: params.oldSku,
      newSku: params.newSku,
      updatedAt: new Date(),
      message: `[MODO DEMONSTRAÇÃO] SKU da variação ${params.externalVariationId} (Anúncio ${params.externalListingId}) alterado com sucesso de "${params.oldSku}" para "${params.newSku}".`
    };
  }

  async confirmSkuChange(params: ConfirmSkuChangeParams): Promise<SkuConfirmationResult> {
    return {
      confirmed: true,
      actualSku: params.expectedSku,
      matches: true,
      message: `[MODO DEMONSTRAÇÃO] Confirmação verificada: SKU ativo é "${params.expectedSku}".`
    };
  }

  async updateStock(params: UpdateStockParams): Promise<MarketplaceUpdateResult> {
    return {
      success: true,
      externalListingId: params.externalListingId,
      externalVariationId: params.externalVariationId,
      oldSku: 'SKU_OLD',
      newSku: 'SKU_OLD',
      updatedAt: new Date(),
      message: `[MODO DEMONSTRAÇÃO] Estoque atualizado para ${params.newStock} unidades.`
    };
  }

  async createListing(params: CreateListingParams): Promise<MarketplaceCreateResult> {
    const mockId = `FAKE_LISTING_${Date.now()}`;
    return {
      success: true,
      externalListingId: mockId,
      listingUrl: `https://${this.marketplaceName}.com/item/${mockId}`,
      message: `[MODO DEMONSTRAÇÃO] Anúncio "${params.title}" criado com sucesso (SKU: ${params.sku}).`
    };
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return {
      remainingRequests: 5000,
      resetInSeconds: 3600
    };
  }

  async getCapabilities(): Promise<MarketplaceCapabilities> {
    return {
      canEditListingSku: true,
      canEditVariationSku: true,
      canEditTitle: true,
      canEditStock: true,
      canEditPrice: true,
      canPauseListing: true,
      canReactivateListing: true,
      requiresListingRefreshAfterUpdate: true,
      supportsIdempotencyKey: true
    };
  }

  normalizeError(error: unknown): NormalizedMarketplaceError {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      code: 'FAKE_MARKETPLACE_ERROR',
      message: msg,
      isRetryable: true
    };
  }
}
