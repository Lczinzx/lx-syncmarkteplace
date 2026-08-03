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
import { PreviewService, SelectionDefinition } from './services/preview.service.js';
import { TransformationRule } from './services/transformation.service.js';
import { SkuQueueService } from './jobs/sku-queue.service.js';
import { RollbackService } from './services/rollback.service.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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

// In-Memory Database Store
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
  skuJobs: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>
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
      message: 'Autenticado com sucesso via Google OAuth'
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(401).json({ success: false, error: `Falha na autenticação: ${message}` });
  }
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, user: req.user });
});

/* ==========================================================================
   ROTAS DE CONTAS E ADAPTER CAPABILITIES (ETAPA 8)
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
    lastImportAt: acc.lastImportAt
  }));

  return res.json({ success: true, accounts: safeAccounts });
});

app.get('/api/sku-changes/capabilities', authenticateToken, async (req: Request, res: Response) => {
  const adapter = new FakeMarketplaceAdapter();
  const caps = await adapter.getCapabilities();
  return res.json({ success: true, capabilities: caps });
});

/* ==========================================================================
   ROTAS DE PRÉ-VISUALIZAÇÃO & EXECUÇÃO EM LOTE DE SKUS (FASE 3 - ETAPAS 9 A 18)
   ========================================================================== */

app.post('/api/sku-changes/preview', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { selection, rule } = req.body as { selection: SelectionDefinition; rule: TransformationRule };

    if (!selection || !rule) {
      return res.status(400).json({ success: false, error: 'Definição de seleção e regra de transformação são obrigatórias.' });
    }

    const preview = await PreviewService.generatePreview(
      req.user!.organizationId,
      selection,
      rule,
      dbStore.listings
    );

    return res.json({ success: true, preview });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.post('/api/sku-changes/confirm', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { previewId, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum item válido para alteração.' });
    }

    const jobId = `job-sku-${Date.now()}`;
    const result = await SkuQueueService.processJob(jobId, req.user!.organizationId, items);

    // Atualiza SKUs dos anúncios e variações no banco em memória
    items.forEach(imp => {
      dbStore.listings.forEach(l => {
        if (l.externalListingId === imp.externalListingId) {
          l.variations.forEach(v => {
            if (v.externalVariationId === imp.externalVariationId) {
              v.currentSku = imp.newSku;
            }
          });
        }
      });
    });

    const jobRecord = {
      id: jobId,
      organizationId: req.user!.organizationId,
      requestedBy: req.user!.email,
      operationType: 'BULK_SKU_UPDATE',
      status: result.status,
      totalItems: result.totalItems,
      successfulItems: result.successfulItems,
      failedItems: result.failedItems,
      items: result.items,
      createdAt: new Date().toISOString()
    };

    dbStore.skuJobs.push(jobRecord);

    dbStore.auditLogs.push({
      id: `audit-${Date.now()}`,
      organizationId: req.user!.organizationId,
      userId: req.user!.userId,
      action: 'EXECUTE_BULK_SKU_UPDATE',
      resourceType: 'SKU_CHANGE_JOB',
      resourceId: jobId,
      status: 'SUCCESS',
      createdAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      job: jobRecord,
      message: `[MODO DEMONSTRAÇÃO] Job ${jobId} concluído com sucesso (${result.successfulItems} SKUs atualizados).`
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.get('/api/sku-changes/jobs', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const orgJobs = dbStore.skuJobs.filter(j => j.organizationId === req.user!.organizationId);
  return res.json({ success: true, jobs: orgJobs.reverse() });
});

app.get('/api/sku-changes/jobs/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const job = dbStore.skuJobs.find(j => j.id === req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job de alteração não encontrado.' });
  }
  return res.json({ success: true, job });
});

app.post('/api/sku-changes/jobs/:id/pause', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const job = dbStore.skuJobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado.' });
  job.status = 'PAUSED';
  return res.json({ success: true, job, message: 'Job pausado com sucesso.' });
});

app.post('/api/sku-changes/jobs/:id/resume', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const job = dbStore.skuJobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado.' });
  job.status = 'PROCESSING';
  return res.json({ success: true, job, message: 'Job retomado com sucesso.' });
});

app.post('/api/sku-changes/jobs/:id/cancel', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const job = dbStore.skuJobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado.' });
  job.status = 'CANCELLED';
  return res.json({ success: true, job, message: 'Job cancelado com sucesso.' });
});

/* ==========================================================================
   ROTAS DE ROLLBACK E DESFAZER (ETAPA 18)
   ========================================================================== */

app.post('/api/sku-changes/jobs/:id/rollback-preview', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const job = dbStore.skuJobs.find(j => j.id === req.params.id) as any;
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job original não encontrado para rollback.' });
  }

  const preview = RollbackService.generateRollbackPreview(job);
  return res.json({ success: true, preview });
});

app.post('/api/sku-changes/jobs/:id/rollback-confirm', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const job = dbStore.skuJobs.find(j => j.id === req.params.id) as any;
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job original não encontrado.' });
  }

  const result = await RollbackService.confirmRollback(
    req.user!.organizationId,
    req.user!.email,
    job
  );

  dbStore.skuJobs.push(result);

  return res.json({ success: true, rollbackJob: result });
});

app.get('/health', (req: Request, res: Response) => {
  return res.json({ status: 'ONLINE', platform: 'LX Sync Backend REST API (Fase 3)', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 LX Sync Backend Server (Fase 3) rodando na porta ${PORT}`);
});
