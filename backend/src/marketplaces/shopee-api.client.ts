import crypto from 'crypto';

export interface ShopeeApiConfig {
  partnerId: number;
  partnerKey: string;
  environment?: 'sandbox' | 'production';
  redirectUrl?: string;
}

export interface ShopeeTokenResponse {
  error: string;
  message: string;
  response?: {
    access_token: string;
    refresh_token: string;
    expire_in: number;
    shop_id: number;
    merchant_id_list?: number[];
  };
  request_id: string;
}

export interface ShopeeItemListResponse {
  error: string;
  message: string;
  response?: {
    item: Array<{ item_id: number; item_status: string; update_time: number }>;
    total_count: number;
    has_next_page: boolean;
    next_cursor: string;
  };
  request_id: string;
}

export interface ShopeeItemBaseInfoResponse {
  error: string;
  message: string;
  response?: {
    item_list: Array<{
      item_id: number;
      category_id: number;
      item_name: string;
      description: string;
      item_sku: string;
      create_time: number;
      update_time: number;
      image: {
        image_url_list: string[];
        image_id_list?: string[];
      };
      price_info: Array<{
        currency: string;
        original_price: number;
        current_price: number;
      }>;
      stock_info_v2?: {
        summary_info: {
          total_reserved_stock: number;
          total_available_stock: number;
        };
      };
      item_status: string;
      dimension?: {
        package_length: number;
        package_width: number;
        package_height: number;
      };
      weight?: number;
      has_model: boolean;
    }>;
  };
  request_id: string;
}

export interface ShopeeModelListResponse {
  error: string;
  message: string;
  response?: {
    tier_variation?: Array<{
      name: string;
      option_list: Array<{ option: string; image?: { image_url: string } }>;
    }>;
    model?: Array<{
      model_id: number;
      model_sku: string;
      tier_index: number[];
      price_info: Array<{
        currency: string;
        original_price: number;
        current_price: number;
      }>;
      stock_info_v2?: {
        summary_info: {
          total_reserved_stock: number;
          total_available_stock: number;
        };
      };
    }>;
  };
  request_id: string;
}

export const SHOPEE_HOSTS = {
  production: 'https://partner.shopeemobile.com',
  sandbox: 'https://openplatform.sandbox.test-stable.shopee.sg'
} as const;

export class ShopeeApiClient {
  private partnerId: number;
  private partnerKey: string;
  private baseUrl: string;
  private redirectUrl: string;
  private environment: 'sandbox' | 'production';

  constructor(config?: Partial<ShopeeApiConfig>) {
    const env = (config?.environment || process.env.SHOPEE_ENVIRONMENT || 'sandbox').trim().toLowerCase() as 'sandbox' | 'production';
    this.environment = env === 'production' ? 'production' : 'sandbox';

    if (config?.partnerId !== undefined) {
      this.partnerId = Number(config.partnerId);
    } else if (this.environment === 'production') {
      const pIdRaw = process.env.SHOPEE_PRODUCTION_PARTNER_ID || process.env.SHOPEE_PARTNER_ID;
      this.partnerId = Number(pIdRaw);
    } else {
      const pIdRaw = process.env.SHOPEE_SANDBOX_PARTNER_ID || process.env.SHOPEE_PARTNER_ID;
      this.partnerId = Number(pIdRaw);
    }

    if (!this.partnerId || !Number.isSafeInteger(this.partnerId) || this.partnerId <= 0) {
      const err = new Error(
        `A integração Shopee ${this.environment === 'production' ? 'Production' : 'Sandbox'} não está configurada corretamente (Partner ID ausente ou inválido).`
      ) as any;
      err.code = 'SHOPEE_PARTNER_ID_INVALID';
      err.isRetryable = false;
      throw err;
    }

    if (config?.partnerKey !== undefined) {
      this.partnerKey = String(config.partnerKey).trim();
    } else if (this.environment === 'production') {
      this.partnerKey = (process.env.SHOPEE_PRODUCTION_PARTNER_KEY || process.env.SHOPEE_PARTNER_KEY || '').trim();
    } else {
      this.partnerKey = (process.env.SHOPEE_SANDBOX_PARTNER_KEY || process.env.SHOPEE_PARTNER_KEY || '').trim();
    }

    if (!this.partnerKey || this.partnerKey.length === 0) {
      const err = new Error(
        `A integração Shopee ${this.environment === 'production' ? 'Production' : 'Sandbox'} não está configurada corretamente (Partner Key ausente).`
      ) as any;
      err.code = 'SHOPEE_PARTNER_KEY_INVALID';
      err.isRetryable = false;
      throw err;
    }

    this.baseUrl = SHOPEE_HOSTS[this.environment];

    this.redirectUrl = config?.redirectUrl || process.env.SHOPEE_REDIRECT_URL || 'https://lx-sync-api.onrender.com/api/marketplaces/shopee/callback';
  }

  public getDiagnosticInfo() {
    const normalizedKey = (this.partnerKey || '').trim();
    const keyFingerprint = crypto
      .createHash('sha256')
      .update(normalizedKey, 'utf8')
      .digest('hex')
      .slice(0, 12);

    return {
      environment: this.environment,
      partnerId: this.partnerId,
      partnerIdConfigured: Boolean(this.partnerId && this.partnerId > 0),
      partnerIdValid: Boolean(Number.isSafeInteger(this.partnerId) && this.partnerId > 0),
      partnerKeyConfigured: Boolean(normalizedKey.length > 0),
      partnerKeyLength: normalizedKey.length,
      partnerKeyFingerprint: keyFingerprint,
      host: this.baseUrl,
      path: '/api/v2/shop/auth_partner',
      redirectUrl: this.redirectUrl,
      redirectConfigured: Boolean(this.redirectUrl && this.redirectUrl.trim() !== ''),
      timestampSkewSeconds: 0
    };
  }

  /**
   * Valida estritamente a configuração das variáveis de ambiente no boot do servidor
   */
  public static validateEnvironmentConfig(): { valid: boolean; environment: 'sandbox' | 'production'; partnerId: number; redirectUrl: string } {
    const env = process.env.SHOPEE_ENVIRONMENT?.trim().toLowerCase();
    if (env !== 'sandbox' && env !== 'production') {
      throw new Error('SHOPEE_ENVIRONMENT inválido ou ausente. Deve ser estritamente "sandbox" ou "production".');
    }

    const partnerId = Number(process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_PRODUCTION_PARTNER_ID || process.env.SHOPEE_SANDBOX_PARTNER_ID);
    if (!partnerId || !Number.isSafeInteger(partnerId) || partnerId <= 0) {
      throw new Error('SHOPEE_PARTNER_ID inválido ou ausente. Deve ser um número de ID parceiro numérico válido.');
    }

    const partnerKey = process.env.SHOPEE_PARTNER_KEY?.trim();
    if (!partnerKey) {
      throw new Error('SHOPEE_PARTNER_KEY ausente.');
    }

    const redirectUrl = process.env.SHOPEE_REDIRECT_URL?.trim();
    if (!redirectUrl) {
      throw new Error('SHOPEE_REDIRECT_URL ausente.');
    }

    if (env === 'production' && !redirectUrl.startsWith('https://')) {
      throw new Error('SHOPEE_REDIRECT_URL em ambiente de produção deve ser obrigatoriamente HTTPS.');
    }

    const writesEnabled = process.env.ENABLE_REAL_MARKETPLACE_WRITES;
    if (writesEnabled !== 'false') {
      throw new Error('ENABLE_REAL_MARKETPLACE_WRITES deve ser estritamente "false" nesta fase.');
    }

    return { valid: true, environment: env, partnerId, redirectUrl };
  }

  /**
   * Algoritmo Oficial de Assinatura HMAC-SHA256 da Shopee Open API v2
   */
  public generateSign(path: string, timestamp: number, accessToken?: string, shopId?: number): string {
    const normalizedKey = (this.partnerKey || '').trim();
    let baseString = `${this.partnerId}${path}${timestamp}`;
    if (accessToken) {
      baseString += accessToken;
    }
    if (shopId) {
      baseString += shopId;
    }
    return crypto.createHmac('sha256', normalizedKey).update(baseString, 'utf8').digest('hex');
  }

  /**
   * URL de Autorização da Loja Shopee (`/api/v2/shop/auth_partner`)
   */
  public getAuthUrl(state: string): string {
    const path = '/api/v2/shop/auth_partner';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp);

    const params = new URLSearchParams({
      partner_id: String(this.partnerId),
      timestamp: String(timestamp),
      sign,
      redirect: this.redirectUrl
    });

    return `${this.baseUrl}${path}?${params.toString()}&state=${encodeURIComponent(state)}`;
  }

  /**
   * Troca o `code` de autorização pelo `access_token` e `refresh_token`
   */
  public async getTokens(code: string, shopId: number): Promise<ShopeeTokenResponse> {
    const path = '/api/v2/auth/token/get';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp);

    const url = `${this.baseUrl}${path}?partner_id=${this.partnerId}&timestamp=${timestamp}&sign=${sign}`;

    return await this.requestWithRetry<ShopeeTokenResponse>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        partner_id: this.partnerId,
        shop_id: shopId
      })
    });
  }

  /**
   * Renova o `access_token` expirado usando o `refresh_token`
   */
  public async refreshAccessToken(refreshToken: string, shopId: number): Promise<ShopeeTokenResponse> {
    const path = '/api/v2/auth/access_token/get';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp);

    const url = `${this.baseUrl}${path}?partner_id=${this.partnerId}&timestamp=${timestamp}&sign=${sign}`;

    return await this.requestWithRetry<ShopeeTokenResponse>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        partner_id: this.partnerId,
        shop_id: shopId
      })
    });
  }

  /**
   * Cancela a Autorização da Loja (`/api/v2/shop/cancel_auth_partner`)
   */
  public async cancelAuthPartner(accessToken: string, shopId: number): Promise<unknown> {
    const path = '/api/v2/shop/cancel_auth_partner';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp, accessToken, shopId);

    const url = `${this.baseUrl}${path}?partner_id=${this.partnerId}&timestamp=${timestamp}&sign=${sign}&access_token=${accessToken}&shop_id=${shopId}`;

    return await this.requestWithRetry<unknown>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id: this.partnerId,
        shop_id: shopId
      })
    });
  }

  /**
   * Consulta Lista de Anúncios Paginada (`/api/v2/product/get_item_list`)
   */
  public async getItemList(
    accessToken: string,
    shopId: number,
    itemStatus: string = 'NORMAL',
    pageSize: number = 50,
    cursor: string = ''
  ): Promise<ShopeeItemListResponse> {
    const path = '/api/v2/product/get_item_list';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp, accessToken, shopId);

    let url = `${this.baseUrl}${path}?partner_id=${this.partnerId}&timestamp=${timestamp}&access_token=${accessToken}&shop_id=${shopId}&sign=${sign}&item_status=${itemStatus}&page_size=${pageSize}`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    return await this.requestWithRetry<ShopeeItemListResponse>(url, { method: 'GET' });
  }

  /**
   * Consulta Informações Detalhadas dos Itens em Lote (`/api/v2/product/get_item_base_info`)
   */
  public async getItemBaseInfo(
    accessToken: string,
    shopId: number,
    itemIds: number[]
  ): Promise<ShopeeItemBaseInfoResponse> {
    const path = '/api/v2/product/get_item_base_info';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp, accessToken, shopId);

    const url = `${this.baseUrl}${path}?partner_id=${this.partnerId}&timestamp=${timestamp}&access_token=${accessToken}&shop_id=${shopId}&sign=${sign}&item_id_list=${itemIds.join(',')}`;

    return await this.requestWithRetry<ShopeeItemBaseInfoResponse>(url, { method: 'GET' });
  }

  /**
   * Consulta Modelos/Variações de um Anúncio (`/api/v2/product/get_model_list`)
   */
  public async getModelList(
    accessToken: string,
    shopId: number,
    itemId: number
  ): Promise<ShopeeModelListResponse> {
    const path = '/api/v2/product/get_model_list';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp, accessToken, shopId);

    const url = `${this.baseUrl}${path}?partner_id=${this.partnerId}&timestamp=${timestamp}&access_token=${accessToken}&shop_id=${shopId}&sign=${sign}&item_id=${itemId}`;

    return await this.requestWithRetry<ShopeeModelListResponse>(url, { method: 'GET' });
  }

  /**
   * Requisição HTTP genérica com Exponential Backoff e Jitter (Max 3 retries para 429/5xx)
   */
  private async requestWithRetry<T>(url: string, options: RequestInit, retries = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, options);

        if (response.status === 429 || response.status >= 500) {
          const backoffMs = Math.pow(2, attempt) * 500 + Math.random() * 200;
          await new Promise(res => setTimeout(res, backoffMs));
          continue;
        }

        const data = await response.json();
        return data as T;
      } catch (err) {
        lastError = err;
        const backoffMs = Math.pow(2, attempt) * 500 + Math.random() * 200;
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }

    throw lastError || new Error(`Falha na requisição Shopee API após ${retries} tentativas.`);
  }
}
