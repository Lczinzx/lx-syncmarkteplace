import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function encryptSecret(plainText: string): string {
  const master = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
  const key = crypto.scryptSync(master, 'lxsync_salt_2026', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function main() {
  if (process.env.ENABLE_DEMO_SEED !== 'true') {
    console.log('⏭️  Seed DEMO ignorado: ENABLE_DEMO_SEED não é "true".');
    return;
  }

  console.log('🌱 Semeando dados DEMO (LX Sync)...');

  // 1. Organização
  const org = await prisma.organization.upsert({
    where: { slug: 'festum-decor' },
    update: {},
    create: {
      id: 'org-festum-decor',
      name: 'Festum Decor SaaS (Demonstração)',
      slug: 'festum-decor',
      status: 'ACTIVE'
    }
  });

  // 2. Usuários Admin
  await prisma.user.upsert({
    where: { email: 'lucasoliveiradossantos008@gmail.com' },
    update: {},
    create: {
      id: 'usr-admin-1',
      organizationId: org.id,
      googleId: 'google_sub_lucas',
      email: 'lucasoliveiradossantos008@gmail.com',
      name: 'Lucas Oliveira',
      role: 'ADMIN',
      avatarUrl: 'https://ui-avatars.com/api/?name=Lucas+Oliveira&background=EF4444&color=fff'
    }
  });

  await prisma.user.upsert({
    where: { email: 'festumcontato@gmail.com' },
    update: {},
    create: {
      id: 'usr-admin-2',
      organizationId: org.id,
      googleId: 'google_sub_festum',
      email: 'festumcontato@gmail.com',
      name: 'Festum Contato',
      role: 'ADMIN',
      avatarUrl: 'https://ui-avatars.com/api/?name=Festum+Contato&background=991B1B&color=fff'
    }
  });

  // 3. Contas Simuladas
  const accShopee = await prisma.marketplaceAccount.upsert({
    where: { id: 'acc-shopee-demo' },
    update: {},
    create: {
      id: 'acc-shopee-demo',
      organizationId: org.id,
      marketplace: 'shopee',
      accountName: 'Festum Decor - Shopee Oficial (Demo)',
      sellerId: '2035668',
      shopId: '2035668',
      status: 'CONNECTED',
      isDemo: true,
      accessTokenEncrypted: encryptSecret('mock_shopee_token')
    }
  });

  const accMeli = await prisma.marketplaceAccount.upsert({
    where: { id: 'acc-meli-demo' },
    update: {},
    create: {
      id: 'acc-meli-demo',
      organizationId: org.id,
      marketplace: 'meli',
      accountName: 'Festum Decor - Mercado Livre (Demo)',
      sellerId: 'MLB_SELLER_9876',
      status: 'CONNECTED',
      isDemo: true,
      accessTokenEncrypted: encryptSecret('mock_meli_token')
    }
  });

  // 4. Produto Mestre
  const masterProd = await prisma.masterProduct.upsert({
    where: { id: 'prod-zoologico-04' },
    update: {},
    create: {
      id: 'prod-zoologico-04',
      organizationId: org.id,
      name: 'Painel Redondo Zoologico 04 1.50m',
      masterSku: 'Z - Red50 - Zoologico - 04',
      productType: 'Redondo',
      size: 'Red50',
      theme: 'Zoologico',
      designCode: '04',
      status: 'ACTIVE'
    }
  });

  await prisma.inventoryItem.upsert({
    where: { masterProductId: masterProd.id },
    update: {},
    create: {
      id: 'inv-zoologico-04',
      organizationId: org.id,
      masterProductId: masterProd.id,
      totalStock: 50,
      reservedStock: 0,
      safetyBuffer: 2,
      availableStock: 48
    }
  });

  console.log('✅ Seed de desenvolvimento concluído com sucesso!');
}

main()
  .catch(e => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
