import { PrismaClient, MarketplaceAccount } from '@prisma/client';
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
import { ShopeeApiClient } from './shopee-api.client.js';
import { ShopeeAuthService } from '../services/shopee-auth.service.js';

export class ShopeeMarketplaceAdapter implements MarketplaceAdapter {
  private prisma: PrismaClient;
  private account: MarketplaceAccount;
  private apiClient: ShopeeApiClient;

  constructor(account: MarketplaceAccount, prisma: PrismaClient) {
    if (account.isDemo) {
      throw new Error(`ShopeeMarketplaceAdapter não pode ser instanciado para contas DEMO (${account.id}). Use FakeMarketplaceAdapter.`);
    }
    this.account = account;
    this.prisma = prisma;
    this.apiClient = new ShopeeApiClient();
  }

  /**
   * Valida se escritas remotas estão liberadas pela Feature Flag
   */
  private checkWritePermission(): void {
    if (process.env.ENABLE_REAL_MARKETPLACE_WRITES !== 'true') {
      const error = new Error('Escritas em contas reais de marketplace estão desativadas nesta fase (Modo Somente Leitura).') as any;
      error.code = 'REAL_MARKETPLACE_WRITES_DISABLED';
      error.isRetryable = false;
      throw error;
    }
  }

  /**
   * Obtém access token e shopId válidos
   */
  private async getAuthCtx(): Promise<{ accessToken: string; shopId: number }> {
    return await ShopeeAuthService.getValidAccessToken(this.prisma, this.account.id);
  }

  public async connectAccount(): Promise<ConnectionResult> {
    return {
      success: this.account.status === 'CONNECTED',
      accountId: this.account.id,
      shopId: this.account.shopId || undefined,
      sellerId: this.account.sellerId || undefined,
      accountName: this.account.accountName,
      message: 'Conta Shopee conectada.'
    };
  }

  public async refreshAccessToken(): Promise<TokenRefreshResult> {
    try {
      const { accessToken } = await ShopeeAuthService.refreshAccessToken(this.prisma, this.account.id);
      return {
        success: true,
        accessToken,
        message: 'Token de acesso renovado com sucesso.'
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err)
      };
    }
  }

  public async disconnectAccount(): Promise<void> {
    await ShopeeAuthService.disconnectAccount(
      this.prisma,
      this.account.organizationId,
      'system',
      this.account.id
    );
  }

  public async getAccountInfo(): Promise<AccountInfo> {
    return {
      accountId: this.account.id,
      marketplace: 'shopee',
      accountName: this.account.accountName,
      sellerId: this.account.sellerId || undefined,
      shopId: this.account.shopId || undefined,
      status: this.account.status,
      lastSyncAt: this.account.lastSyncAt || undefined
    };
  }

  /**
   * Lista todos os anúncios reais da Shopee com loop de paginação completo (`cursor` + `has_next_page`)
   */
  public async listListings(params: ListListingsParams): Promise<ListingsResult> {
    const { accessToken, shopId } = await this.getAuthCtx();

    const allItemIds: number[] = [];
    let cursor = '';
    let hasNextPage = true;

    // 1. Coleta completa de todos os item_ids via paginação oficial da Shopee
    while (hasNextPage) {
      const listRes = await this.apiClient.getItemList(accessToken, shopId, 'NORMAL', 50, cursor);
      if (listRes.error || !listRes.response) {
        throw new Error(`Erro ao listar itens na Shopee API: ${listRes.message || listRes.error}`);
      }

      const items = listRes.response.item || [];
      items.forEach(i => allItemIds.push(i.item_id));

      hasNextPage = listRes.response.has_next_page;
      cursor = listRes.response.next_cursor || '';

      if (!hasNextPage || !cursor) break;
    }

    if (allItemIds.length === 0) {
      return { listings: [], total: 0, page: 1, totalPages: 1 };
    }

    // 2. Busca de informações detalhadas dos itens em lotes de 50 (limite oficial da API)
    const listingsDTO: MarketplaceListingDTO[] = [];
    const batchSize = 50;

    for (let i = 0; i < allItemIds.length; i += batchSize) {
      const batchIds = allItemIds.slice(i, i + batchSize);
      const infoRes = await this.apiClient.getItemBaseInfo(accessToken, shopId, batchIds);

      if (infoRes.error || !infoRes.response || !infoRes.response.item_list) {
        continue;
      }

      for (const itemInfo of infoRes.response.item_list) {
        const externalListingId = String(itemInfo.item_id);
        const imageUrl = itemInfo.image?.image_url_list?.[0] || undefined;
        const status = itemInfo.item_status === 'NORMAL' ? 'ACTIVE' : 'PAUSED';

        listingsDTO.push({
          externalListingId,
          externalProductId: externalListingId,
          title: itemInfo.item_name,
          description: itemInfo.description,
          imageUrl,
          categoryId: itemInfo.category_id ? String(itemInfo.category_id) : undefined,
          status,
          listingUrl: `https://shopee.com.br/product/${shopId}/${externalListingId}`,
          rawData: itemInfo
        });
      }
    }

    return {
      listings: listingsDTO,
      total: listingsDTO.length,
      page: 1,
      totalPages: 1
    };
  }

  /**
   * Consulta detalhada de um único anúncio
   */
  public async getListing(externalListingId: string): Promise<MarketplaceListingDTO> {
    const { accessToken, shopId } = await this.getAuthCtx();
    const itemId = Number(externalListingId);

    const infoRes = await this.apiClient.getItemBaseInfo(accessToken, shopId, [itemId]);
    if (infoRes.error || !infoRes.response?.item_list?.[0]) {
      throw new Error(`Anúncio ${externalListingId} não encontrado na Shopee.`);
    }

    const itemInfo = infoRes.response.item_list[0];
    return {
      externalListingId,
      externalProductId: externalListingId,
      title: itemInfo.item_name,
      description: itemInfo.description,
      imageUrl: itemInfo.image?.image_url_list?.[0],
      categoryId: itemInfo.category_id ? String(itemInfo.category_id) : undefined,
      status: itemInfo.item_status === 'NORMAL' ? 'ACTIVE' : 'PAUSED',
      listingUrl: `https://shopee.com.br/product/${shopId}/${externalListingId}`,
      rawData: itemInfo
    };
  }

  /**
   * Consulta variações/modelos de um anúncio (`get_model_list`)
   */
  public async listVariations(externalListingId: string): Promise<MarketplaceVariationDTO[]> {
    const { accessToken, shopId } = await this.getAuthCtx();
    const itemId = Number(externalListingId);

    const modelRes = await this.apiClient.getModelList(accessToken, shopId, itemId);
    if (modelRes.error || !modelRes.response?.model) {
      return [];
    }

    const tierVars = modelRes.response.tier_variation || [];
    const models = modelRes.response.model || [];

    return models.map(m => {
      let varName = m.model_sku || `Modelo ${m.model_id}`;
      if (tierVars.length > 0 && m.tier_index) {
        const optionNames = m.tier_index.map((optIdx, tierIdx) => {
          const tier = tierVars[tierIdx];
          return tier?.option_list?.[optIdx]?.option || '';
        }).filter(Boolean);
        if (optionNames.length > 0) {
          varName = optionNames.join(' - ');
        }
      }

      const price = m.price_info?.[0]?.current_price || 0;
      const stock = m.stock_info_v2?.summary_info?.total_available_stock || 0;

      return {
        externalVariationId: String(m.model_id),
        externalModelId: String(m.model_id),
        variationName: varName,
        currentSku: m.model_sku || varName,
        price,
        stock,
        status: 'ACTIVE',
        rawData: m
      };
    });
  }

  public async findBySku(sku: string): Promise<MarketplaceSkuMatch[]> {
    const listingsResult = await this.listListings({});
    const matches: MarketplaceSkuMatch[] = [];

    for (const listing of listingsResult.listings) {
      const vars = await this.listVariations(listing.externalListingId);
      for (const v of vars) {
        if (v.currentSku.toLowerCase() === sku.toLowerCase()) {
          matches.push({
            externalListingId: listing.externalListingId,
            externalVariationId: v.externalVariationId,
            currentSku: v.currentSku,
            title: listing.title,
            variationName: v.variationName,
            marketplace: 'shopee'
          });
        }
      }
    }

    return matches;
  }

  public async validateSku(sku: string): Promise<SkuValidationResult> {
    if (!sku || sku.trim() === '') {
      return { valid: false, sku, message: 'SKU não pode ser vazio.' };
    }
    return { valid: true, sku };
  }

  public async validateSkuChange(params: ValidateSkuChangeParams): Promise<SkuValidationResult> {
    return this.validateSku(params.newSku);
  }

  // ==========================================
  // OPERAÇÕES DE ESCRITA — BLOQUEADAS EM MODO SOMENTE LEITURA
  // ==========================================

  public async updateListingSku(params: UpdateListingSkuParams): Promise<MarketplaceUpdateResult> {
    this.checkWritePermission();
    throw new Error('Não implementado.');
  }

  public async updateVariationSku(params: UpdateVariationSkuParams): Promise<MarketplaceUpdateResult> {
    this.checkWritePermission();
    throw new Error('Não implementado.');
  }

  public async confirmSkuChange(params: ConfirmSkuChangeParams): Promise<SkuConfirmationResult> {
    this.checkWritePermission();
    throw new Error('Não implementado.');
  }

  public async updateStock(params: UpdateStockParams): Promise<MarketplaceUpdateResult> {
    this.checkWritePermission();
    throw new Error('Não implementado.');
  }

  public async createListing(params: CreateListingParams): Promise<MarketplaceCreateResult> {
    this.checkWritePermission();
    throw new Error('Não implementado.');
  }

  public async getRateLimitStatus(): Promise<RateLimitStatus> {
    return { remainingRequests: 1000, resetInSeconds: 60 };
  }

  public async getCapabilities(): Promise<MarketplaceCapabilities> {
    const isWriteEnabled = process.env.ENABLE_REAL_MARKETPLACE_WRITES === 'true';
    return {
      canEditListingSku: isWriteEnabled,
      canEditVariationSku: isWriteEnabled,
      canEditTitle: isWriteEnabled,
      canEditStock: isWriteEnabled,
      canEditPrice: isWriteEnabled,
      canPauseListing: isWriteEnabled,
      canReactivateListing: isWriteEnabled,
      requiresListingRefreshAfterUpdate: true,
      supportsIdempotencyKey: false
    };
  }

  public normalizeError(error: unknown): NormalizedMarketplaceError {
    const err = error as any;
    if (err?.code === 'REAL_MARKETPLACE_WRITES_DISABLED') {
      return {
        code: 'REAL_MARKETPLACE_WRITES_DISABLED',
        message: err.message,
        isRetryable: false
      };
    }

    return {
      code: err?.error || 'SHOPEE_API_ERROR',
      message: err?.message || (err instanceof Error ? err.message : String(err)),
      isRetryable: err?.status === 429 || err?.status >= 500
    };
  }
}
