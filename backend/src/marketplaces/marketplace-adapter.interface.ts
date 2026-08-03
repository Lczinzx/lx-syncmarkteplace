export interface ConnectionResult {
  success: boolean;
  accountId?: string;
  sellerId?: string;
  shopId?: string;
  accountName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  message?: string;
}

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  message?: string;
}

export interface AccountInfo {
  accountId: string;
  marketplace: string;
  accountName: string;
  sellerId?: string;
  shopId?: string;
  status: string;
  lastSyncAt?: Date;
}

export interface ListListingsParams {
  page?: number;
  limit?: number;
  status?: string;
  searchQuery?: string;
}

export interface MarketplaceListingDTO {
  externalListingId: string;
  externalProductId?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  categoryId?: string;
  status: string;
  listingUrl?: string;
  rawData?: unknown;
}

export interface MarketplaceVariationDTO {
  externalVariationId: string;
  externalModelId?: string;
  variationName: string;
  attributes?: Record<string, string>;
  currentSku: string;
  price: number;
  stock: number;
  status: string;
  rawData?: unknown;
}

export interface ListingsResult {
  listings: MarketplaceListingDTO[];
  total: number;
  page: number;
  totalPages: number;
}

export interface MarketplaceSkuMatch {
  externalListingId: string;
  externalVariationId?: string;
  currentSku: string;
  title: string;
  variationName?: string;
  marketplace: string;
}

export interface SkuValidationResult {
  valid: boolean;
  sku: string;
  conflicts?: string[];
  warnings?: string[];
  message?: string;
}

export interface ValidateSkuChangeParams {
  externalListingId: string;
  externalVariationId?: string;
  oldSku: string;
  newSku: string;
}

export interface UpdateListingSkuParams {
  externalListingId: string;
  oldSku: string;
  newSku: string;
  idempotencyKey: string;
}

export interface UpdateVariationSkuParams {
  externalListingId: string;
  externalVariationId: string;
  oldSku: string;
  newSku: string;
  idempotencyKey: string;
}

export interface MarketplaceUpdateResult {
  success: boolean;
  externalListingId: string;
  externalVariationId?: string;
  oldSku: string;
  newSku: string;
  updatedAt: Date;
  rawResponse?: unknown;
  errorCode?: string;
  message?: string;
}

export interface ConfirmSkuChangeParams {
  externalListingId: string;
  externalVariationId?: string;
  expectedSku: string;
}

export interface SkuConfirmationResult {
  confirmed: boolean;
  actualSku: string;
  matches: boolean;
  message?: string;
}

export interface UpdateStockParams {
  externalListingId: string;
  externalVariationId?: string;
  newStock: number;
}

export interface CreateListingParams {
  title: string;
  sku: string;
  price: number;
  stock: number;
  description?: string;
  imageUrl?: string;
  categoryId?: string;
}

export interface MarketplaceCreateResult {
  success: boolean;
  externalListingId?: string;
  listingUrl?: string;
  message?: string;
}

export interface RateLimitStatus {
  remainingRequests: number;
  resetInSeconds: number;
}

export interface NormalizedMarketplaceError {
  code: string;
  message: string;
  isRetryable: boolean;
  statusCode?: number;
  rawError?: unknown;
}

export interface MarketplaceAdapter {
  connectAccount(): Promise<ConnectionResult>;
  refreshAccessToken(): Promise<TokenRefreshResult>;
  disconnectAccount(): Promise<void>;
  getAccountInfo(): Promise<AccountInfo>;

  listListings(params: ListListingsParams): Promise<ListingsResult>;
  getListing(externalListingId: string): Promise<MarketplaceListingDTO>;
  listVariations(externalListingId: string): Promise<MarketplaceVariationDTO[]>;

  findBySku(sku: string): Promise<MarketplaceSkuMatch[]>;
  validateSku(sku: string): Promise<SkuValidationResult>;
  validateSkuChange(params: ValidateSkuChangeParams): Promise<SkuValidationResult>;

  updateListingSku(params: UpdateListingSkuParams): Promise<MarketplaceUpdateResult>;
  updateVariationSku(params: UpdateVariationSkuParams): Promise<MarketplaceUpdateResult>;
  confirmSkuChange(params: ConfirmSkuChangeParams): Promise<SkuConfirmationResult>;

  updateStock(params: UpdateStockParams): Promise<MarketplaceUpdateResult>;
  createListing(params: CreateListingParams): Promise<MarketplaceCreateResult>;

  getRateLimitStatus(): Promise<RateLimitStatus>;
  normalizeError(error: unknown): NormalizedMarketplaceError;
}
