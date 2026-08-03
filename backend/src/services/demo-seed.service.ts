import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../utils/crypto.js';

export const DEMO_ORGANIZATION_ID = 'org-festum-decor';
export const DEMO_ACCOUNT_ID = 'acc-shopee-demo';

export interface DemoSeedResult {
  enabled: boolean;
  seeded: boolean;
  accountId: string | null;
  reason?: string;
}

/**
 * Garante a existência da organização Festum Decor e da conta DEMO de Shopee
 * no PostgreSQL (upsert idempotente).
 *
 * Proteção: somente executa quando ENABLE_DEMO_SEED=true, evitando seeds
 * DEMO indiscriminados em produção.
 */
export async function ensureDemoData(client: PrismaClient): Promise<DemoSeedResult> {
  if (process.env.ENABLE_DEMO_SEED !== 'true') {
    return { enabled: false, seeded: false, accountId: null, reason: 'ENABLE_DEMO_SEED != true' };
  }

  const org = await client.organization.upsert({
    where: { slug: 'festum-decor' },
    update: { name: 'Festum Decor SaaS (Demonstração)', status: 'ACTIVE' },
    create: {
      id: DEMO_ORGANIZATION_ID,
      name: 'Festum Decor SaaS (Demonstração)',
      slug: 'festum-decor',
      status: 'ACTIVE'
    }
  });

  const account = await client.marketplaceAccount.upsert({
    where: { id: DEMO_ACCOUNT_ID },
    update: {
      organizationId: org.id,
      marketplace: 'shopee',
      accountName: 'Festum Decor',
      externalAccountId: 'demo-shopee-2035668',
      shopId: '2035668',
      status: 'CONNECTED',
      isDemo: true
    },
    create: {
      id: DEMO_ACCOUNT_ID,
      organizationId: org.id,
      marketplace: 'shopee',
      accountName: 'Festum Decor',
      externalAccountId: 'demo-shopee-2035668',
      shopId: '2035668',
      sellerId: '2035668',
      status: 'CONNECTED',
      isDemo: true,
      accessTokenEncrypted: encryptSecret('demo_shopee_access_token_simulado')
    }
  });

  return { enabled: true, seeded: true, accountId: account.id };
}
