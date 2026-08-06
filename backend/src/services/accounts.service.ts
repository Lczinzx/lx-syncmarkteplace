import { PrismaClient, MarketplaceAccount } from '@prisma/client';
import { encryptSecret } from '../utils/crypto.js';

export interface CreateAccountInput {
  marketplace: string;
  accountName: string;
  sellerId?: string;
  shopId?: string;
  externalAccountId?: string;
  accessToken?: string;
  isDemo?: boolean;
}

export interface UpdateAccountInput extends Partial<CreateAccountInput> {}

export interface MarketplaceAccountView {
  id: string;
  organizationId: string;
  marketplace: string;
  accountName: string;
  sellerId: string | null;
  shopId: string | null;
  externalAccountId: string | null;
  status: string;
  isDemo: boolean;
  environment: string | null;
  lastAuthorizedAt: string | null;
  lastSyncAt: string | null;
  lastImportAt: string | null;
  createdAt: string;
}

export function toAccountView(acc: MarketplaceAccount): MarketplaceAccountView {
  return {
    id: acc.id,
    organizationId: acc.organizationId,
    marketplace: acc.marketplace,
    accountName: acc.accountName,
    sellerId: acc.sellerId,
    shopId: acc.shopId,
    externalAccountId: acc.externalAccountId,
    status: acc.status,
    isDemo: acc.isDemo,
    environment: acc.environment || 'sandbox',
    lastAuthorizedAt: acc.lastAuthorizedAt ? acc.lastAuthorizedAt.toISOString() : null,
    lastSyncAt: acc.lastSyncAt ? acc.lastSyncAt.toISOString() : null,
    lastImportAt: acc.lastImportAt ? acc.lastImportAt.toISOString() : null,
    createdAt: acc.createdAt.toISOString()
  };
}

function encryptIfPresent(token?: string): { accessTokenEncrypted: string } {
  if (!token || String(token).trim() === '') {
    return { accessTokenEncrypted: '' };
  }
  return { accessTokenEncrypted: encryptSecret(String(token)) };
}

/**
 * Lista contas de marketplace de uma organização (única fonte: PostgreSQL).
 */
export async function listMarketplaceAccounts(
  client: PrismaClient,
  organizationId: string
): Promise<MarketplaceAccountView[]> {
  const accounts = await client.marketplaceAccount.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' }
  });
  return accounts.map(toAccountView);
}

/**
 * Busca conta pelo ID garantindo que pertença à organização autenticada.
 * Retorna null se não existir ou se pertencer a outra organização.
 */
export async function findAccountByOrg(
  client: PrismaClient,
  organizationId: string,
  accountId: string
): Promise<MarketplaceAccount | null> {
  if (!accountId) return null;
  return client.marketplaceAccount.findFirst({
    where: { id: accountId, organizationId }
  });
}

/**
 * Cria uma conta de marketplace persistida no PostgreSQL.
 */
export async function createMarketplaceAccount(
  client: PrismaClient,
  organizationId: string,
  input: CreateAccountInput
): Promise<MarketplaceAccount> {
  if (!input.marketplace || !input.accountName) {
    throw new Error('marketplace e accountName são obrigatórios.');
  }

  const tokenData = encryptIfPresent(input.accessToken);

  return client.marketplaceAccount.create({
    data: {
      organizationId,
      marketplace: input.marketplace,
      accountName: input.accountName,
      sellerId: input.sellerId || null,
      shopId: input.shopId || null,
      externalAccountId: input.externalAccountId || null,
      isDemo: input.isDemo === true,
      status: 'CONNECTED',
      ...tokenData
    }
  });
}

/**
 * Atualiza uma conta da organização (404 semântico se não pertencer).
 */
export async function updateMarketplaceAccount(
  client: PrismaClient,
  organizationId: string,
  accountId: string,
  input: UpdateAccountInput
): Promise<MarketplaceAccount | null> {
  const existing = await findAccountByOrg(client, organizationId, accountId);
  if (!existing) return null;

  const tokenData = encryptIfPresent(input.accessToken);

  return client.marketplaceAccount.update({
    where: { id: existing.id },
    data: {
      ...(input.marketplace !== undefined ? { marketplace: input.marketplace } : {}),
      ...(input.accountName !== undefined ? { accountName: input.accountName } : {}),
      ...(input.sellerId !== undefined ? { sellerId: input.sellerId || null } : {}),
      ...(input.shopId !== undefined ? { shopId: input.shopId || null } : {}),
      ...(input.externalAccountId !== undefined ? { externalAccountId: input.externalAccountId || null } : {}),
      ...(input.isDemo !== undefined ? { isDemo: input.isDemo } : {}),
      ...tokenData
    }
  });
}

/**
 * Remove uma conta da organização. Retorna quantas foram excluídas (0 = não existia).
 */
export async function deleteMarketplaceAccount(
  client: PrismaClient,
  organizationId: string,
  accountId: string
): Promise<number> {
  const result = await client.marketplaceAccount.deleteMany({
    where: { id: accountId, organizationId }
  });
  return result.count;
}
