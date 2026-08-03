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

export class FakeMarketplaceAdapter implements MarketplaceAdapter {
  private marketplaceName: string;
  private accountId: string;
  public readonly isFakeAdapter = true;

  constructor(marketplaceName = 'FakeMarketplace', accountId = 'fake-acc-123') {
    this.marketplaceName = marketplaceName;
    this.accountId = accountId;
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
    const mockListings: MarketplaceListingDTO[] = [
      {
        externalListingId: 'MLB-100200300',
        externalProductId: 'PROD-001',
        title: 'Painel Redondo Zoologico 04 1.50m (SIMULADO)',
        description: 'Painel em tecido sublimado com elástico',
        imageUrl: 'assets/logo.svg',
        categoryId: 'DECOR_PARTY',
        status: 'ACTIVE',
        listingUrl: 'https://mercadolivre.com.br/item/MLB100200300'
      },
      {
        externalListingId: 'SHP-99887766',
        externalProductId: 'PROD-002',
        title: 'Cilindro P M G Zoologico Estampa 04 (SIMULADO)',
        description: 'Trio de capas para cilindro com acabamento em elástico',
        imageUrl: 'assets/logo.svg',
        categoryId: 'PARTY_PROPS',
        status: 'ACTIVE',
        listingUrl: 'https://shopee.com.br/product/123/99887766'
      }
    ];

    return {
      listings: mockListings,
      total: mockListings.length,
      page: params.page || 1,
      totalPages: 1
    };
  }

  async getListing(externalListingId: string): Promise<MarketplaceListingDTO> {
    return {
      externalListingId,
      externalProductId: 'PROD-001',
      title: `Anúncio Simulado (${externalListingId})`,
      description: 'Descrição simulada do produto',
      status: 'ACTIVE',
      listingUrl: `https://${this.marketplaceName}.com/item/${externalListingId}`
    };
  }

  async listVariations(externalListingId: string): Promise<MarketplaceVariationDTO[]> {
    return [
      {
        externalVariationId: `VAR_${externalListingId}_1`,
        variationName: 'Tamanho 1.50m (Redondo 50)',
        currentSku: 'Z - Red50 - Zoologico - 04',
        price: 89.90,
        stock: 15,
        status: 'ACTIVE'
      },
      {
        externalVariationId: `VAR_${externalListingId}_2`,
        variationName: 'Tamanho 1.80m (Redondo 80)',
        currentSku: 'Z - Red80 - Zoologico - 04',
        price: 119.90,
        stock: 8,
        status: 'ACTIVE'
      }
    ];
  }

  async findBySku(sku: string): Promise<MarketplaceSkuMatch[]> {
    return [
      {
        externalListingId: 'MLB-100200300',
        externalVariationId: 'VAR_MLB-100200300_1',
        currentSku: sku,
        title: 'Painel Redondo Zoologico 04',
        variationName: 'Tamanho 1.50m',
        marketplace: this.marketplaceName
      }
    ];
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
