import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { cleanupDemoData } from '../services/demo-seed.service.js';

dotenv.config();

const prisma = new PrismaClient();

async function runAdminCleanup() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || !args.includes('--confirm=REMOVE_DEMO_DATA');
  const allowCleanupEnv = process.env.ALLOW_DEMO_CLEANUP === 'true';

  console.log('============================================================');
  console.log('🧹 SCRIPT ADMINISTRATIVO DE LIMPEZA DE DADOS DEMO (LX SYNC)');
  console.log('============================================================\n');

  try {
    // 1. Relatório Prévio Obrigatório
    const demoAccounts = await prisma.marketplaceAccount.findMany({
      where: { isDemo: true },
      select: { id: true, marketplace: true, accountName: true, shopId: true, organizationId: true }
    });

    const realAccounts = await prisma.marketplaceAccount.findMany({
      where: { isDemo: false },
      select: { id: true, marketplace: true, accountName: true, shopId: true, organizationId: true }
    });

    const demoAccountIds = demoAccounts.map(a => a.id);
    const realAccountIds = realAccounts.map(a => a.id);

    const demoListingsCount = demoAccountIds.length > 0 ? await prisma.marketplaceListing.count({
      where: { marketplaceAccountId: { in: demoAccountIds } }
    }) : 0;

    const realListingsCount = realAccountIds.length > 0 ? await prisma.marketplaceListing.count({
      where: { marketplaceAccountId: { in: realAccountIds } }
    }) : 0;

    const demoVariationsCount = demoAccountIds.length > 0 ? await prisma.marketplaceVariation.count({
      where: { listing: { marketplaceAccountId: { in: demoAccountIds } } }
    }) : 0;

    const realVariationsCount = realAccountIds.length > 0 ? await prisma.marketplaceVariation.count({
      where: { listing: { marketplaceAccountId: { in: realAccountIds } } }
    }) : 0;

    const demoImagesCount = demoAccountIds.length > 0 ? await prisma.marketplaceListingImage.count({
      where: { listing: { marketplaceAccountId: { in: demoAccountIds } } }
    }) : 0;

    const realImagesCount = realAccountIds.length > 0 ? await prisma.marketplaceListingImage.count({
      where: { listing: { marketplaceAccountId: { in: realAccountIds } } }
    }) : 0;

    const demoProductMappingsCount = demoAccountIds.length > 0 ? await prisma.productMapping.count({
      where: { listing: { marketplaceAccountId: { in: demoAccountIds } } }
    }) : 0;

    console.log('📊 AUDITORIA DO BANCO DE DADOS:');
    console.log(`- Contas DEMO (isDemo=true): ${demoAccounts.length}`);
    demoAccounts.forEach(a => console.log(`   • [${a.marketplace.toUpperCase()}] ${a.accountName} (ID: ${a.id}, ShopID: ${a.shopId}, Org: ${a.organizationId})`));
    console.log(`- Contas REAIS (isDemo=false): ${realAccounts.length}`);
    realAccounts.forEach(a => console.log(`   • [${a.marketplace.toUpperCase()}] ${a.accountName} (ID: ${a.id}, ShopID: ${a.shopId}, Org: ${a.organizationId})`));

    console.log('\n📦 ANÚNCIOS & VARIAÇÕES:');
    console.log(`- Anúncios DEMO: ${demoListingsCount} | Variações DEMO: ${demoVariationsCount} | Imagens DEMO: ${demoImagesCount}`);
    console.log(`- Anúncios REAIS: ${realListingsCount} | Variações REAIS: ${realVariationsCount} | Imagens REAIS: ${realImagesCount}`);
    console.log(`- ProductMappings DEMO afetados: ${demoProductMappingsCount}`);

    console.log('\n============================================================');

    if (isDryRun) {
      console.log('🔍 MODO DRY-RUN ATIVO: Nenhuma alteração foi realizada no banco.');
      console.log('Para executar a remoção definitiva em produção:');
      console.log('1. Configure ALLOW_DEMO_CLEANUP=true no ambiente.');
      console.log('2. Execute: npm run admin:cleanup-demo -- --confirm=REMOVE_DEMO_DATA\n');
      return;
    }

    if (!allowCleanupEnv) {
      console.error('❌ ABORTADO: A variável de ambiente ALLOW_DEMO_CLEANUP não está definida como "true".');
      console.error('Por segurança, defina ALLOW_DEMO_CLEANUP=true antes de confirmar a exclusão.\n');
      process.exit(1);
    }

    console.log('🚀 EXECUÇÃO DE LIMPEZA AUTORIZADA — Removendo dados DEMO...');
    const result = await cleanupDemoData(prisma);

    console.log('✅ LIMPEZA ADMINISTRATIVA CONCLUÍDA COM SUCESSO:');
    console.log(`- Contas DEMO removidas: ${result.accountsDeleted}`);
    console.log(`- Anúncios DEMO removidos: ${result.listingsDeleted}`);
    console.log(`- Variações DEMO removidas: ${result.variationsDeleted}`);
    console.log(`- Contas REAIS preservadas intactas: ${realAccounts.length}`);
    console.log(`- Anúncios REAIS preservados intactos: ${realListingsCount}\n`);

  } catch (error: any) {
    console.error('\n🚨 ERRO AO EXECUTAR LIMPEZA ADMINISTRATIVA:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAdminCleanup();
