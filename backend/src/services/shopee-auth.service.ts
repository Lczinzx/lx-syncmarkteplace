import { PrismaClient, MarketplaceAccount } from '@prisma/client';
import crypto from 'crypto';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { ShopeeApiClient } from '../marketplaces/shopee-api.client.js';

export interface ShopeeStatePayload {
  state: string;
  organizationId: string;
  userId: string;
  expiresAt: number;
}

// Armazenamento em memória de estados ativas de autorização com HMAC
const activeAuthStateMap = new Map<string, ShopeeStatePayload>();

// Trava de concorrência por conta para renovação de token (concurrency lock)
const refreshLockSet = new Set<string>();

export class ShopeeAuthService {
  /**
   * Gera a URL de autorização da Shopee com `state` criptograficamente seguro e HMAC
   */
  public static generateAuthorizeUrl(organizationId: string, userId: string): string {
    const apiClient = new ShopeeApiClient();
    const randomHex = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const expiresAt = timestamp + 10 * 60 * 1000; // 10 minutos de expiração

    const secretKey = process.env.JWT_SECRET || 'shopee_state_fallback_secret';
    const hmacSig = crypto
      .createHmac('sha256', secretKey)
      .update(`${randomHex}:${organizationId}:${userId}:${expiresAt}`)
      .digest('hex');

    const state = `shopee_state_${randomHex}_${hmacSig}`;

    activeAuthStateMap.set(state, {
      state,
      organizationId,
      userId,
      expiresAt
    });

    return apiClient.getAuthUrl(state);
  }

  /**
   * Valida o `state` recebido no callback OAuth
   */
  public static validateState(state: string): ShopeeStatePayload | null {
    if (!state || !state.startsWith('shopee_state_')) return null;

    const payload = activeAuthStateMap.get(state);
    if (!payload) return null;

    activeAuthStateMap.delete(state); // Consumo único (prevent replay attacks)

    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  }

  /**
   * Processa o callback de autorização, troca o `code` por tokens e persiste a conta
   */
  public static async handleCallback(
    client: PrismaClient,
    code: string,
    shopIdNum: number,
    statePayload: ShopeeStatePayload
  ): Promise<MarketplaceAccount> {
    const apiClient = new ShopeeApiClient();
    const tokenRes = await apiClient.getTokens(code, shopIdNum);

    if (tokenRes.error || !tokenRes.response) {
      throw new Error(`Falha ao obter tokens da Shopee API: ${tokenRes.message || tokenRes.error}`);
    }

    const { access_token, refresh_token, expire_in, shop_id } = tokenRes.response;

    const encryptedAccessToken = encryptSecret(access_token);
    const encryptedRefreshToken = encryptSecret(refresh_token);
    const tokenExpiresAt = new Date(Date.now() + expire_in * 1000);

    const accountId = `acc-shopee-${shop_id}`;

    const account = await client.marketplaceAccount.upsert({
      where: { id: accountId },
      update: {
        organizationId: statePayload.organizationId,
        marketplace: 'shopee',
        accountName: `Festum Decor - Shopee (${shop_id})`,
        shopId: String(shop_id),
        sellerId: String(shop_id),
        status: 'CONNECTED',
        isDemo: false,
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        tokenExpiresAt,
        lastSyncAt: new Date(),
        updatedAt: new Date()
      },
      create: {
        id: accountId,
        organizationId: statePayload.organizationId,
        marketplace: 'shopee',
        accountName: `Festum Decor - Shopee (${shop_id})`,
        externalAccountId: `shopee-${shop_id}`,
        shopId: String(shop_id),
        sellerId: String(shop_id),
        status: 'CONNECTED',
        isDemo: false,
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        tokenExpiresAt,
        lastSyncAt: new Date()
      }
    });

    await client.auditLog.create({
      data: {
        organizationId: statePayload.organizationId,
        userId: statePayload.userId,
        action: 'CONNECT_MARKETPLACE_ACCOUNT',
        resourceType: 'MARKETPLACE_ACCOUNT',
        resourceId: account.id,
        status: 'SUCCESS',
        newValueJson: JSON.stringify({ marketplace: 'shopee', shopId: shop_id, isDemo: false })
      }
    });

    return account;
  }

  /**
   * Obtém o `access_token` válido da conta, renovando proativamente se estiver prestes a expirar
   */
  public static async getValidAccessToken(client: PrismaClient, accountId: string): Promise<{ accessToken: string; shopId: number }> {
    const account = await client.marketplaceAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new Error(`Conta ${accountId} não encontrada.`);
    }

    if (account.isDemo) {
      throw new Error(`Conta ${accountId} é uma conta DEMO simulada.`);
    }

    const shopId = Number(account.shopId);
    if (!shopId) {
      throw new Error(`shopId inválido na conta ${accountId}.`);
    }

    const marginMs = 10 * 60 * 1000; // 10 minutos de margem
    const isExpiredOrNear = account.tokenExpiresAt ? (account.tokenExpiresAt.getTime() - Date.now() < marginMs) : true;

    if (isExpiredOrNear) {
      return await this.refreshAccessToken(client, accountId);
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted || '');
    return { accessToken, shopId };
  }

  /**
   * Renovação atômica do token com trava de concorrência (refreshLock)
   */
  public static async refreshAccessToken(client: PrismaClient, accountId: string): Promise<{ accessToken: string; shopId: number }> {
    if (refreshLockSet.has(accountId)) {
      // Aguardar liberação do lock (máximo 5 segundos)
      for (let i = 0; i < 25; i++) {
        await new Promise(res => setTimeout(res, 200));
        if (!refreshLockSet.has(accountId)) break;
      }
    }

    refreshLockSet.add(accountId);

    try {
      const account = await client.marketplaceAccount.findUnique({ where: { id: accountId } });
      if (!account || !account.refreshTokenEncrypted || !account.shopId) {
        throw new Error(`Credenciais de renovação ausentes na conta ${accountId}.`);
      }

      const rawRefreshToken = decryptSecret(account.refreshTokenEncrypted);
      const shopId = Number(account.shopId);

      const apiClient = new ShopeeApiClient();
      const tokenRes = await apiClient.refreshAccessToken(rawRefreshToken, shopId);

      if (tokenRes.error || !tokenRes.response) {
        await client.marketplaceAccount.update({
          where: { id: accountId },
          data: { status: 'AUTHENTICATION_ERROR', updatedAt: new Date() }
        });
        throw new Error(`Renovação de token falhou na Shopee API: ${tokenRes.message || tokenRes.error}`);
      }

      const { access_token, refresh_token, expire_in } = tokenRes.response;

      const encryptedAccessToken = encryptSecret(access_token);
      const encryptedRefreshToken = encryptSecret(refresh_token);
      const tokenExpiresAt = new Date(Date.now() + expire_in * 1000);

      await client.marketplaceAccount.update({
        where: { id: accountId },
        data: {
          accessTokenEncrypted: encryptedAccessToken,
          refreshTokenEncrypted: encryptedRefreshToken,
          tokenExpiresAt,
          status: 'CONNECTED',
          updatedAt: new Date()
        }
      });

      return { accessToken: access_token, shopId };
    } finally {
      refreshLockSet.delete(accountId);
    }
  }

  /**
   * Desconecta a conta Shopee Real e invalida a autorização na plataforma
   */
  public static async disconnectAccount(client: PrismaClient, organizationId: string, userId: string, accountId: string): Promise<boolean> {
    const account = await client.marketplaceAccount.findFirst({
      where: { id: accountId, organizationId }
    });

    if (!account) return false;

    if (!account.isDemo && account.accessTokenEncrypted && account.shopId) {
      try {
        const accessToken = decryptSecret(account.accessTokenEncrypted);
        const apiClient = new ShopeeApiClient();
        await apiClient.cancelAuthPartner(accessToken, Number(account.shopId));
      } catch (err) {
        console.warn(`[SHOPEE-AUTH] Aviso ao cancelar autorização na Shopee:`, err);
      }
    }

    await client.marketplaceAccount.delete({ where: { id: accountId } });

    await client.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'DISCONNECT_MARKETPLACE_ACCOUNT',
        resourceType: 'MARKETPLACE_ACCOUNT',
        resourceId: accountId,
        status: 'SUCCESS',
        newValueJson: JSON.stringify({ marketplace: 'shopee', shopId: account.shopId })
      }
    });

    return true;
  }
}
