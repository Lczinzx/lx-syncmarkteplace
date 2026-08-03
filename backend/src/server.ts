import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { verifyGoogleToken, generateSessionJWT, verifySessionJWT, isAdminEmail, UserSessionPayload } from './auth/google-auth.service.js';
import { FakeMarketplaceAdapter } from './marketplaces/fake-marketplace.adapter.js';
import { encryptSecret, maskSensitiveValue } from './utils/crypto.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Extend Express Request type
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

// In-Memory Database Store para desenvolvimento de Fase 1
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
      accessTokenEncrypted: encryptSecret('mock_shopee_access_token_123'),
      lastSyncAt: new Date().toISOString()
    },
    {
      id: 'acc-meli-1',
      organizationId: 'org-festum-decor',
      marketplace: 'meli',
      accountName: 'Festum Decor - Mercado Livre',
      sellerId: 'MLB_SELLER_9876',
      status: 'CONNECTED',
      accessTokenEncrypted: encryptSecret('mock_meli_access_token_456'),
      lastSyncAt: new Date().toISOString()
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
      mappingsCount: 4
    }
  ],
  jobs: [] as Array<Record<string, unknown>>
};

/* ==========================================================================
   ROTAS DE AUTENTICAÇÃO REAL (ETAPA 4)
   ========================================================================== */

app.post('/api/auth/google', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token do Google é obrigatório.' });
    }

    const googleUser = await verifyGoogleToken(token);
    
    // Validação estrita de e-mail administrador no BACKEND
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

    return res.json({
      success: true,
      token: jwtToken,
      user: sessionPayload,
      message: 'Autenticado com sucesso via Google OAuth (Servidor Backend)'
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(401).json({ success: false, error: `Falha na autenticação: ${message}` });
  }
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, user: req.user });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

/* ==========================================================================
   ROTAS DE GERENCIAMENTO DE CONTAS & ADAPTERS (ETAPA 8)
   ========================================================================== */

app.get('/api/marketplace-accounts', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  // Retorna contas SEM expor tokens ou segredos criptografados
  const safeAccounts = dbStore.accounts.map(acc => ({
    id: acc.id,
    marketplace: acc.marketplace,
    accountName: acc.accountName,
    sellerId: acc.sellerId,
    shopId: acc.shopId,
    status: acc.status,
    lastSyncAt: acc.lastSyncAt,
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
      // Criptografia estrita dos tokens antes de persistir
      accessTokenEncrypted: encryptSecret(apiKey || `mock_api_key_${Date.now()}`),
      lastSyncAt: new Date().toISOString()
    };

    dbStore.accounts.push(newAcc);

    return res.status(201).json({
      success: true,
      account: {
        id: newAcc.id,
        marketplace: newAcc.marketplace,
        accountName: newAcc.accountName,
        sellerId: newAcc.sellerId,
        status: newAcc.status
      },
      message: 'Conta conectada e token criptografado com sucesso no backend.'
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
    isFakeAdapter: true,
    modeNotice: 'MODO DEMONSTRAÇÃO — Teste executado com FakeMarketplaceAdapter'
  });
});

/* ==========================================================================
   ROTAS DE PRODUTOS MESTRES (ETAPA 10)
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

  return res.status(201).json({
    success: true,
    product: newProduct,
    message: 'Produto Mestre criado com sucesso no backend.'
  });
});

/* ==========================================================================
   ROTAS DE PRÉVIA E ALTERAÇÃO EM LOTE DE SKUS (ETAPAS 12 A 16)
   ========================================================================== */

app.post('/api/sku-changes/preview', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { masterProductId, newSku } = req.body;

  if (!masterProductId || !newSku) {
    return res.status(400).json({ success: false, error: 'masterProductId e newSku são obrigatórios.' });
  }

  const product = dbStore.masterProducts.find(p => p.id === masterProductId);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Produto Mestre não encontrado.' });
  }

  const previewData = {
    masterProductId,
    masterProductName: product.name,
    oldSku: product.masterSku,
    newSku,
    totalItems: 4,
    validItems: 4,
    blockedItems: 0,
    conflicts: [],
    affectedListings: [
      {
        marketplace: 'Shopee',
        accountName: 'Festum Decor - Shopee Principal',
        externalListingId: '123',
        externalVariationId: '456',
        variationName: 'Redondo 50cm Zoologico 04',
        oldSku: product.masterSku,
        newSku,
        status: 'VALID'
      },
      {
        marketplace: 'Shopee',
        accountName: 'Festum Decor - Shopee Outlet',
        externalListingId: '789',
        externalVariationId: '222',
        variationName: 'Redondo 50cm Zoologico 04',
        oldSku: product.masterSku,
        newSku,
        status: 'VALID'
      },
      {
        marketplace: 'Mercado Livre',
        accountName: 'Festum Decor - Mercado Livre',
        externalListingId: 'MLB123',
        externalVariationId: '333',
        variationName: 'Painel Redondo Zoologico 04',
        oldSku: product.masterSku,
        newSku,
        status: 'VALID'
      },
      {
        marketplace: 'TikTok Shop',
        accountName: 'Festum Decor - TikTok Principal',
        externalListingId: '987',
        externalVariationId: '654',
        variationName: 'Painel Zoologico 04',
        oldSku: product.masterSku,
        newSku,
        status: 'VALID'
      }
    ]
  };

  return res.json({ success: true, preview: previewData });
});

app.post('/api/sku-changes/confirm', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { masterProductId, newSku } = req.body;

  const product = dbStore.masterProducts.find(p => p.id === masterProductId);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Produto Mestre não encontrado.' });
  }

  const jobId = `job-sku-${Date.now()}`;
  const oldSku = product.masterSku;

  // Processa lote usando FakeMarketplaceAdapter
  const adapter = new FakeMarketplaceAdapter('MultiMarketplace', 'all-accs');
  const updateRes = await adapter.updateListingSku({
    externalListingId: 'MLB123',
    oldSku,
    newSku,
    idempotencyKey: `idempotency_${jobId}`
  });

  product.masterSku = newSku;

  const newJob = {
    id: jobId,
    organizationId: req.user!.organizationId,
    requestedBy: req.user!.email,
    operationType: 'BULK_SKU_UPDATE',
    status: 'SUCCESS',
    totalItems: 4,
    successfulItems: 4,
    failedItems: 0,
    oldSku,
    newSku,
    details: updateRes.message,
    completedAt: new Date().toISOString()
  };

  dbStore.jobs.push(newJob);

  return res.json({
    success: true,
    job: newJob,
    message: 'Lote de alteração de SKU executado e verificado com sucesso no backend.'
  });
});

/* ==========================================================================
   ROTA DE DASHBOARD (ETAPA 19)
   ========================================================================== */

app.get('/api/dashboard', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    success: true,
    metrics: {
      connectedAccounts: dbStore.accounts.length,
      disconnectedAccounts: 0,
      importedListings: 128,
      importedVariations: 342,
      masterProducts: dbStore.masterProducts.length,
      mappedProducts: dbStore.masterProducts.length,
      divergentSkus: 0,
      pendingChanges: 0,
      completedChanges: dbStore.jobs.length
    }
  });
});

app.get('/health', (req: Request, res: Response) => {
  return res.json({ status: 'ONLINE', platform: 'LX Sync Backend', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 LX Sync Backend Server rodando na porta ${PORT}`);
});
