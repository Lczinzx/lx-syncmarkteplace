import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { verifyGoogleToken, generateSessionJWT, verifySessionJWT, isAdminEmail, UserSessionPayload } from './auth/google-auth.service.js';
import { FakeMarketplaceAdapter } from './marketplaces/fake-marketplace.adapter.js';
import { encryptSecret, maskSensitiveValue } from './utils/crypto.js';
import { ImportService } from './services/import.service.js';
import {
  normalizeSkuForComparison,
  normalizeListingTitleForComparison,
  decomposeSku,
  calculateMatchConfidence
} from './services/matching.service.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Restrito e Seguro
const allowedOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['http://localhost:5173', 'http://localhost:3000', 'https://lxsync.netlify.app'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por regra de segurança CORS.'));
    }
  },
  credentials: true
}));

app.use(express.json());

interface AuthenticatedRequest extends Request {
  user?: UserSessionPayload;
}

// Middleware de Autenticação JWT
function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Acesso negado: Token de autenticação não fornecido.' });
  }

  try {
    const user = verifySessionJWT(token);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Sessão inválida ou expirada.' });
  }
}

// In-Memory Database Store para desenvolvimento com persistência em lote
const dbStore = {
  organizations: [
    { id: 'org-festum-decor', name: 'Festum Decor SaaS', slug: 'festum-decor', status: 'ACTIVE' }
  ],
  users: [
    {
      id: 'usr-admin-1',
      organizationId: 'org-festum-decor',
      email: 'lucasoliveiradossantos008@gmail.com',
      name: 'Lucas Oliveira',
      role: 'ADMIN',
      avatarUrl: 'https://ui-avatars.com/api/?name=Lucas+Oliveira&background=EF4444&color=fff'
    },
    {
      id: 'usr-admin-2',
      organizationId: 'org-festum-decor',
      email: 'festumcontato@gmail.com',
      name: 'Festum Contato',
      role: 'ADMIN',
      avatarUrl: 'https://ui-avatars.com/api/?name=Festum+Contato&background=991B1B&color=fff'
    }
  ],
  accounts: [
    {
      id: 'acc-shopee-1',
      organizationId: 'org-festum-decor',
      marketplace: 'shopee',
      accountName: 'Festum Decor - Shopee Oficial',
      sellerId: '2035668',
      shopId: '2035668',
      status: 'CONNECTED',
      isDemo: true,
      accessTokenEncrypted: encryptSecret('mock_shopee_access_token_123'),
      lastSyncAt: new Date().toISOString(),
      lastImportAt: new Date().toISOString()
    },
    {
      id: 'acc-meli-1',
      organizationId: 'org-festum-decor',
      marketplace: 'meli',
      accountName: 'Festum Decor - Mercado Livre',
      sellerId: 'MLB_SELLER_9876',
      status: 'CONNECTED',
      isDemo: true,
      accessTokenEncrypted: encryptSecret('mock_meli_access_token_456'),
      lastSyncAt: new Date().toISOString(),
      lastImportAt: new Date().toISOString()
    }
  ],
  listings: [
    {
      id: 'list-1',
      organizationId: 'org-festum-decor',
      marketplaceAccountId: 'acc-shopee-1',
      marketplace: 'shopee',
      accountName: 'Festum Decor - Shopee Oficial',
      externalListingId: 'SHP-99887766',
      title: 'Painel Redondo Zoologico 04 1.50m C/ Elastico',
      imageUrl: 'assets/logo.svg',
      status: 'ACTIVE',
      variations: [
        {
          id: 'var-1',
          externalVariationId: 'VAR_SHP_1',
          variationName: 'Tamanho 1.50m (Redondo 50)',
          currentSku: 'Z - Red50 - Zoologico - 04',
          price: 89.90,
          stock: 15,
          status: 'ACTIVE'
        },
        {
          id: 'var-2',
          externalVariationId: 'VAR_SHP_2',
          variationName: 'Tamanho 1.80m (Redondo 80)',
          currentSku: 'Z - Red80 - Zoologico - 04',
          price: 119.90,
          stock: 8,
          status: 'ACTIVE'
        }
      ]
    },
    {
      id: 'list-2',
      organizationId: 'org-festum-decor',
      marketplaceAccountId: 'acc-meli-1',
      marketplace: 'meli',
      accountName: 'Festum Decor - Mercado Livre',
      externalListingId: 'MLB-100200300',
      title: 'Capa Painel Redondo Zoologico Estampa 04 Sublimado',
      imageUrl: 'assets/logo.svg',
      status: 'ACTIVE',
      variations: [
        {
          id: 'var-3',
          externalVariationId: 'VAR_MLB_1',
          variationName: 'Redondo 50cm Zoologico 04',
          currentSku: 'Z-Red50-Zoologico-04',
          price: 94.90,
          stock: 20,
          status: 'ACTIVE'
        }
      ]
    }
  ],
  masterProducts: [
    {
      id: 'prod-zoologico-04',
      organizationId: 'org-festum-decor',
      name: 'Painel Redondo Zoologico 04',
      masterSku: 'Z - Red50 - Zoologico - 04',
      productType: 'Redondo',
      size: 'Red50',
      theme: 'Zoologico',
      designCode: '04',
      status: 'ACTIVE',
      inventory: { totalStock: 50, reservedStock: 0, safetyBuffer: 2, availableStock: 48 },
      mappingsCount: 2
    }
  ],
  mappings: [
    {
      id: 'map-1',
      organizationId: 'org-festum-decor',
      masterProductId: 'prod-zoologico-04',
      marketplaceAccountId: 'acc-shopee-1',
      marketplaceListingId: 'list-1',
      marketplaceVariationId: 'var-1',
      currentMarketplaceSku: 'Z - Red50 - Zoologico - 04',
      confidenceScore: 1.0,
      confirmedByUser: true
    },
    {
      id: 'map-2',
      organizationId: 'org-festum-decor',
      masterProductId: 'prod-zoologico-04',
      marketplaceAccountId: 'acc-meli-1',
      marketplaceListingId: 'list-2',
      marketplaceVariationId: 'var-3',
      currentMarketplaceSku: 'Z-Red50-Zoologico-04',
      confidenceScore: 0.96,
      confirmedByUser: true
    }
  ],
  importJobs: [] as Array<Record<string, unknown>>,
  skuJobs: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>
};

/* ==========================================================================
   ROTAS DE AUTENTICAÇÃO REAL (ETAPA 4 e 5)
   ========================================================================== */

app.post('/api/auth/google', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token do Google é obrigatório.' });
    }

    const googleUser = await verifyGoogleToken(token);
    
    if (!isAdminEmail(googleUser.email)) {
      return res.status(403).json({
        success: false,
        error: `ACESSO NEGADO: A conta Google (${googleUser.email}) não está autorizada como administradora.`
      });
    }

    const sessionPayload: UserSessionPayload = {
      userId: `usr-${googleUser.email}`,
      organizationId: 'org-festum-decor',
      email: googleUser.email,
      name: googleUser.name,
      role: 'ADMIN',
      avatarUrl: googleUser.avatarUrl
    };

    const jwtToken = generateSessionJWT(sessionPayload);

    // Registra Audit Log
    dbStore.auditLogs.push({
      id: `audit-${Date.now()}`,
      organizationId: sessionPayload.organizationId,
      userId: sessionPayload.userId,
      action: 'USER_LOGIN',
      resourceType: 'USER',
      resourceId: sessionPayload.userId,
      status: 'SUCCESS',
      createdAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      token: jwtToken,
      user: sessionPayload,
      message: 'Autenticado com sucesso via Google OAuth (Backend Validados)'
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(401).json({ success: false, error: `Falha na autenticação: ${message}` });
  }
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, user: req.user });
});

app.post('/api/auth/logout', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  dbStore.auditLogs.push({
    id: `audit-${Date.now()}`,
    organizationId: req.user!.organizationId,
    userId: req.user!.userId,
    action: 'USER_LOGOUT',
    resourceType: 'USER',
    resourceId: req.user!.userId,
    status: 'SUCCESS',
    createdAt: new Date().toISOString()
  });

  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

/* ==========================================================================
   ROTAS DE GERENCIAMENTO DE CONTAS (ETAPA 6)
   ========================================================================== */

app.get('/api/marketplace-accounts', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const safeAccounts = dbStore.accounts.map(acc => ({
    id: acc.id,
    marketplace: acc.marketplace,
    accountName: acc.accountName,
    sellerId: acc.sellerId,
    shopId: acc.shopId,
    status: acc.status,
    isDemo: acc.isDemo || false,
    lastSyncAt: acc.lastSyncAt,
    lastImportAt: acc.lastImportAt,
    accessTokenMasked: maskSensitiveValue(acc.accessTokenEncrypted)
  }));

  return res.json({ success: true, accounts: safeAccounts });
});

app.post('/api/marketplace-accounts', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { marketplace, accountName, sellerId, shopId, apiKey } = req.body;
    
    if (!marketplace || !accountName) {
      return res.status(400).json({ success: false, error: 'Campos marketplace e accountName são obrigatórios.' });
    }

    const newAcc = {
      id: `acc-${marketplace}-${Date.now()}`,
      organizationId: req.user!.organizationId,
      marketplace,
      accountName,
      sellerId: sellerId || `SELLER_${Date.now()}`,
      shopId: shopId || `SHOP_${Date.now()}`,
      status: 'CONNECTED',
      isDemo: true, // Demonstração
      accessTokenEncrypted: encryptSecret(apiKey || `mock_api_key_${Date.now()}`),
      lastSyncAt: new Date().toISOString(),
      lastImportAt: new Date().toISOString()
    };

    dbStore.accounts.push(newAcc);

    dbStore.auditLogs.push({
      id: `audit-${Date.now()}`,
      organizationId: req.user!.organizationId,
      userId: req.user!.userId,
      action: 'CREATE_MARKETPLACE_ACCOUNT',
      resourceType: 'MARKETPLACE_ACCOUNT',
      resourceId: newAcc.id,
      marketplace: newAcc.marketplace,
      status: 'SUCCESS',
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      account: {
        id: newAcc.id,
        marketplace: newAcc.marketplace,
        accountName: newAcc.accountName,
        sellerId: newAcc.sellerId,
        status: newAcc.status,
        isDemo: true
      },
      message: 'Conta de demonstração cadastrada com sucesso no backend.'
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.post('/api/marketplace-accounts/:id/test', authenticateToken, async (req: Request, res: Response) => {
  const acc = dbStore.accounts.find(a => a.id === req.params.id);
  if (!acc) {
    return res.status(404).json({ success: false, error: 'Conta de marketplace não encontrada.' });
  }

  const fakeAdapter = new FakeMarketplaceAdapter(acc.marketplace, acc.id);
  const connResult = await fakeAdapter.connectAccount();

  return res.json({
    success: true,
    result: connResult,
    isDemo: true,
    modeNotice: 'CONTA DE DEMONSTRAÇÃO — Operação simulada com FakeMarketplaceAdapter'
  });
});

/* ==========================================================================
   ROTAS DE IMPORTAÇÃO IDEMPOTENTE (ETAPA 7)
   ========================================================================== */

app.post('/api/marketplace-accounts/:id/import', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const acc = dbStore.accounts.find(a => a.id === req.params.id);
  if (!acc) {
    return res.status(404).json({ success: false, error: 'Conta não encontrada para importação.' });
  }

  const jobSummary = await ImportService.executeImportJob(acc, req.user!.email);
  dbStore.importJobs.push(jobSummary);
  acc.lastImportAt = new Date().toISOString();

  // Atualiza anúncios no repositório com idempotência
  jobSummary.listings.forEach(imp => {
    const existing = dbStore.listings.find(l => l.marketplaceAccountId === acc.id && l.externalListingId === imp.externalListingId);
    if (!existing) {
      dbStore.listings.push({
        id: `list-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        organizationId: req.user!.organizationId,
        marketplaceAccountId: acc.id,
        marketplace: acc.marketplace,
        accountName: acc.accountName,
        externalListingId: imp.externalListingId,
        title: imp.title,
        imageUrl: imp.imageUrl || 'assets/logo.svg',
        status: imp.status,
        variations: imp.variations.map(v => ({
          id: `var-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          externalVariationId: v.externalVariationId,
          variationName: v.variationName,
          currentSku: v.currentSku,
          price: v.price,
          stock: v.stock,
          status: v.status
        }))
      });
    }
  });

  return res.json({
    success: true,
    job: jobSummary,
    message: `Importação simulada da conta "${acc.accountName}" concluída com sucesso (${jobSummary.totalListings} anúncios e ${jobSummary.totalVariations} variações).`
  });
});

/* ==========================================================================
   ROTAS DE ANÚNCIOS & BUSCA POR SKU NORMALIZADO (ETAPA 8 A 12)
   ========================================================================== */

app.get('/api/listings', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { accountId, marketplace, status, search } = req.query;

  let filtered = dbStore.listings.filter(l => l.organizationId === req.user!.organizationId);

  if (accountId) {
    filtered = filtered.filter(l => l.marketplaceAccountId === accountId);
  }
  if (marketplace) {
    filtered = filtered.filter(l => l.marketplace === marketplace);
  }
  if (status) {
    filtered = filtered.filter(l => l.status === status);
  }
  if (search) {
    const term = String(search).toLowerCase();
    filtered = filtered.filter(l => 
      l.title.toLowerCase().includes(term) ||
      l.externalListingId.toLowerCase().includes(term) ||
      l.variations.some(v => v.currentSku.toLowerCase().includes(term) || v.variationName.toLowerCase().includes(term))
    );
  }

  return res.json({
    success: true,
    total: filtered.length,
    listings: filtered
  });
});

app.post('/api/listings/search-by-skus', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { skus, matchMode = 'NORMALIZED' } = req.body;

  if (!Array.isArray(skus) || skus.length === 0) {
    return res.status(400).json({ success: false, error: 'Lista de SKUs é obrigatória.' });
  }

  const results: Array<Record<string, unknown>> = [];

  skus.forEach(targetSku => {
    const targetNorm = normalizeSkuForComparison(targetSku);

    dbStore.listings.forEach(listing => {
      listing.variations.forEach(v => {
        const vNorm = normalizeSkuForComparison(v.currentSku);
        let matches = false;

        if (matchMode === 'EXACT') {
          matches = v.currentSku === targetSku;
        } else if (matchMode === 'CONTAINS') {
          matches = v.currentSku.toLowerCase().includes(targetSku.toLowerCase());
        } else {
          // NORMALIZED
          matches = vNorm === targetNorm;
        }

        if (matches) {
          results.push({
            listingId: listing.id,
            externalListingId: listing.externalListingId,
            listingTitle: listing.title,
            marketplace: listing.marketplace,
            accountName: listing.accountName,
            variationId: v.id,
            externalVariationId: v.externalVariationId,
            variationName: v.variationName,
            currentSku: v.currentSku,
            normalizedSku: vNorm,
            matchMode
          });
        }
      });
    });
  });

  return res.json({ success: true, matchesCount: results.length, results });
});

/* ==========================================================================
   ROTAS DE PRODUTOS MESTRES & GRUPOS DE SINCRONIZAÇÃO (ETAPA 14)
   ========================================================================== */

app.get('/api/master-products', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, products: dbStore.masterProducts });
});

app.post('/api/master-products', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { name, masterSku, productType, theme, size, designCode, totalStock } = req.body;
  
  if (!name || !masterSku) {
    return res.status(400).json({ success: false, error: 'Nome e SKU Master são obrigatórios.' });
  }

  const stockVal = Number(totalStock) || 0;
  const newProduct = {
    id: `prod-${Date.now()}`,
    organizationId: req.user!.organizationId,
    name,
    masterSku,
    productType: productType || 'Redondo',
    size: size || 'Red50',
    theme: theme || 'Geral',
    designCode: designCode || '01',
    status: 'ACTIVE',
    inventory: { totalStock: stockVal, reservedStock: 0, safetyBuffer: 2, availableStock: Math.max(0, stockVal - 2) },
    mappingsCount: 0
  };

  dbStore.masterProducts.push(newProduct);

  dbStore.auditLogs.push({
    id: `audit-${Date.now()}`,
    organizationId: req.user!.organizationId,
    userId: req.user!.userId,
    action: 'CREATE_MASTER_PRODUCT',
    resourceType: 'MASTER_PRODUCT',
    resourceId: newProduct.id,
    status: 'SUCCESS',
    createdAt: new Date().toISOString()
  });

  return res.status(201).json({
    success: true,
    product: newProduct,
    message: 'Produto Mestre criado com sucesso no backend.'
  });
});

app.post('/api/product-mappings/suggestions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { listingId, variationId } = req.body;

  const listing = dbStore.listings.find(l => l.id === listingId);
  if (!listing) {
    return res.status(404).json({ success: false, error: 'Anúncio não encontrado.' });
  }

  const variation = listing.variations.find(v => v.id === variationId) || listing.variations[0];

  const suggestions = dbStore.masterProducts.map(prod => {
    const matchRes = calculateMatchConfidence(
      { sku: variation.currentSku, title: listing.title },
      { sku: prod.masterSku, title: prod.name, size: prod.size, theme: prod.theme, code: prod.designCode }
    );

    return {
      masterProductId: prod.id,
      masterProductName: prod.name,
      masterSku: prod.masterSku,
      confidenceScore: matchRes.confidenceScore,
      matchLevel: matchRes.matchLevel,
      compatibilities: matchRes.compatibilities,
      divergences: matchRes.divergences,
      reason: matchRes.reason
    };
  }).sort((a, b) => b.confidenceScore - a.confidenceScore);

  return res.json({ success: true, listingId, variationId, suggestions });
});

/* ==========================================================================
   ROTA DE AUDIT LOGS & DASHBOARD COM DADOS REAIS DA ORGANIZAÇÃO
   ========================================================================== */

app.get('/api/audit-logs', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, logs: dbStore.auditLogs.reverse() });
});

app.get('/api/dashboard', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const orgAccounts = dbStore.accounts.filter(a => a.organizationId === req.user!.organizationId);
  const orgListings = dbStore.listings.filter(l => l.organizationId === req.user!.organizationId);
  
  let totalVars = 0;
  orgListings.forEach(l => { totalVars += l.variations.length; });

  return res.json({
    success: true,
    metrics: {
      connectedAccounts: orgAccounts.length,
      disconnectedAccounts: 0,
      importedListings: orgListings.length,
      importedVariations: totalVars,
      masterProducts: dbStore.masterProducts.length,
      mappedProducts: dbStore.mappings.length,
      divergentSkus: 0,
      pendingChanges: 0,
      completedChanges: dbStore.importJobs.length
    }
  });
});

app.get('/health', (req: Request, res: Response) => {
  return res.json({ status: 'ONLINE', platform: 'LX Sync Backend REST API', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 LX Sync Backend Server rodando na porta ${PORT}`);
});
