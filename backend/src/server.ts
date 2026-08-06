import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { verifyGoogleToken, generateSessionJWT, verifySessionJWT, isAdminEmail, UserSessionPayload } from './auth/google-auth.service.js';
import { FakeMarketplaceAdapter } from './marketplaces/fake-marketplace.adapter.js';
import { ImportService } from './services/import.service.js';
import { ensureDemoData, cleanupDemoData } from './services/demo-seed.service.js';
import { toFriendlyDbErrorMessage } from './utils/prisma-errors.js';
import { parseAllowedOrigins, normalizeOrigin } from './utils/cors-config.js';
import {
  listMarketplaceAccounts,
  findAccountByOrg,
  createMarketplaceAccount,
  updateMarketplaceAccount,
  deleteMarketplaceAccount,
  toAccountView
} from './services/accounts.service.js';
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
import { listMarketplaceListings } from './services/listings.service.js';
import { GroupsService } from './services/groups.service.js';
import { MarketplaceRulesService } from './services/marketplace-rules.service.js';
import { ImageStorageService } from './services/image-storage.service.js';
import { ShopeeAuthService } from './services/shopee-auth.service.js';
import { SyncEngineService, SyncAlreadyRunningError } from './services/sync-engine.service.js';
import { ShopeeMarketplaceAdapter } from './marketplaces/shopee.adapter.js';

dotenv.config();

function maskClientId(clientId: string | undefined): string {
  if (!clientId) return 'NÃO CONFIGURADO';
  if (clientId.length <= 12) return clientId;
  return `${clientId.slice(0, 20)}...`;
}

const bootClientId = process.env.GOOGLE_CLIENT_ID;
console.log(`[AUTH] GOOGLE_CLIENT_ID em uso no servidor: ${maskClientId(bootClientId)}`);
console.log(`[AUTH] JWT_SECRET: ${process.env.JWT_SECRET ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}`);
console.log(`[AUTH] ADMIN_EMAILS: ${(process.env.ADMIN_EMAILS || '').split(',').length} e-mail(s) autorizado(s)`);

// Prisma (PostgreSQL) — fonte única das contas de marketplace
const prisma = new PrismaClient();

// Seed DEMO idempotente e protegido por ENABLE_DEMO_SEED=true
ensureDemoData(prisma)
  .then(res => {
    if (res.enabled) {
      console.log(`[DEMO-SEED] ${res.seeded ? `Contas DEMO prontas (${res.accountsCreated} contas, ${res.groupsCreated} grupo multicanal)` : 'Seed DEMO não executado no boot.'}`);
    } else {
      console.log('[DEMO-SEED] Desativado (ENABLE_DEMO_SEED != true).');
    }
  })
  .catch(err => {
    console.error('[DEMO-SEED] Falha ao executar seed DEMO:', err instanceof Error ? err.message : err);
  });

const app = express();
const PORT = process.env.PORT || 3001;

// Origens permitidas: ALLOWED_ORIGINS (vírgula) + FRONTEND_URL (fallback temporário)
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS, process.env.FRONTEND_URL);
const hasAllowedOrigins = allowedOrigins.length > 0;

// Fallback final de desenvolvimento quando nenhuma variável está configurada
const effectiveAllowedOrigins = hasAllowedOrigins
  ? allowedOrigins
  : ['http://localhost:5173', 'http://localhost:3000', 'https://lxsync.netlify.app'];

console.log(`[CORS] Origens permitidas (${effectiveAllowedOrigins.length}):`);
effectiveAllowedOrigins.forEach(o => console.log(`  - ${o}`));

app.use(cors({
  origin: (origin, callback) => {
    // Requisições sem Origin (healthchecks e chamadas servidor-servidor): permitidas
    if (!origin) {
      return callback(null, true);
    }

    const normalized = normalizeOrigin(origin);

    // Comparação EXATA com a lista de origens permitidas
    if (effectiveAllowedOrigins.includes(normalized)) {
      return callback(null, true);
    }

    return callback(new Error(`Bloqueado por regra de segurança CORS (origem não autorizada: ${origin}).`));
  },
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type']
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
  // NOTE: contas de marketplace NÃO são mais mantidas em memória.
  // Fonte única: tabela marketplace_accounts no PostgreSQL (Prisma).
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
    const body = req.body;

    // Rejeitar payloads que enviam dados de usuário controlados pelo frontend
    if (!body.credential && (body.email || body.name || body.avatar || body.token)) {
      return res.status(400).json({
        error: {
          code: 'GOOGLE_CREDENTIAL_REQUIRED',
          message: 'Credencial do Google obrigatória. Não é permitido enviar email, nome ou avatar diretamente.'
        }
      });
    }

    // Exigir campo credential
    const { credential } = body;
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({
        error: {
          code: 'GOOGLE_CREDENTIAL_REQUIRED',
          message: 'Credencial do Google obrigatória.'
        }
      });
    }

    // Validar token Google real via verifyIdToken (assinatura, audience, issuer, expiração, email_verified)
    let googleUser;
    try {
      googleUser = await verifyGoogleToken(credential);
    } catch (verifyErr: unknown) {
      const verifyMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      console.error(`[AUTH] Falha na verificação do Google ID Token: ${verifyMsg}`);
      return res.status(401).json({
        error: {
          code: 'INVALID_GOOGLE_CREDENTIAL',
          message: 'Não foi possível validar a autenticação com o Google.'
        }
      });
    }

    // Verificar autorização do e-mail (vindo exclusivamente do payload Google validado)
    if (!isAdminEmail(googleUser.email)) {
      return res.status(403).json({
        error: {
          code: 'EMAIL_NOT_AUTHORIZED',
          message: 'Este e-mail não possui acesso ao sistema.'
        }
      });
    }

    // Gerar JWT interno somente após validação completa
    const sessionPayload: UserSessionPayload = {
      userId: `usr-${googleUser.googleId}`,
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
      message: 'Autenticado com sucesso via Google OAuth (verifyIdToken)'
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[AUTH] Erro inesperado: ${message}`);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_AUTH_ERROR',
        message: 'Erro interno na autenticação.'
      }
    });
  }
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, user: req.user });
});

/* ==========================================================================
   ROTAS DE CONTAS E ADAPTER CAPABILITIES (ETAPA 8)
   Fonte única: PostgreSQL (Prisma) — nada de store em memória ou IDs legados
   ========================================================================== */

app.get('/api/marketplace-accounts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accounts = await listMarketplaceAccounts(prisma, req.user!.organizationId);
    return res.json({ success: true, accounts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ACCOUNTS] Erro ao listar contas: ${message}`);
    return res.status(500).json({
      error: {
        code: 'ACCOUNTS_FETCH_FAILED',
        message: toFriendlyDbErrorMessage(err, 'Não foi possível carregar as contas do servidor.')
      }
    });
  }
});

/* ==========================================================================
   ROTAS DE SINCRONIZAÇÃO DA CONTA (FASE 4.2)
   ========================================================================== */

app.post('/api/marketplace-accounts/:accountId/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const organizationId = req.user!.organizationId;

    const account = await findAccountByOrg(prisma, organizationId, accountId);
    if (!account) {
      return res.status(404).json({ error: { code: 'MARKETPLACE_ACCOUNT_NOT_FOUND', message: 'Conta de marketplace não encontrada.' } });
    }

    const syncType = req.body?.syncType === 'FULL' ? 'FULL' : 'INCREMENTAL';

    let adapter: any;
    if (account.isDemo) {
      adapter = new FakeMarketplaceAdapter(account.marketplace, account.id);
    } else if (account.marketplace === 'shopee') {
      adapter = new ShopeeMarketplaceAdapter(account, prisma);
    } else {
      adapter = new FakeMarketplaceAdapter(account.marketplace, account.id);
    }

    const result = await SyncEngineService.executeSync(prisma, {
      organizationId,
      marketplaceAccountId: account.id,
      syncType,
      initiatedByUserId: req.user!.userId,
      adapter
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: req.user!.userId,
        action: 'SYNC_MARKETPLACE_ACCOUNT',
        resourceType: 'MARKETPLACE_ACCOUNT',
        resourceId: account.id,
        marketplace: account.marketplace,
        marketplaceAccountId: account.id,
        newValueJson: JSON.stringify(result)
      }
    });

    return res.json({ success: true, syncRun: result });
  } catch (err: unknown) {
    if ((err as any)?.code === 'SYNC_ALREADY_RUNNING') {
      return res.status(409).json({
        error: {
          code: 'SYNC_ALREADY_RUNNING',
          message: 'Sincronização já está em execução para esta conta.',
          syncRunId: (err as any).syncRunId,
          isRetryable: false
        }
      });
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(`[SYNC] Erro na sincronização da conta ${req.params.accountId}: ${message}`);
    return res.status(500).json({ error: { code: 'SYNC_FAILED', message } });
  }
});

app.get('/api/marketplace-accounts/:accountId/sync-runs', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const organizationId = req.user!.organizationId;

    const account = await findAccountByOrg(prisma, organizationId, accountId);
    if (!account) {
      return res.status(404).json({ error: { code: 'MARKETPLACE_ACCOUNT_NOT_FOUND', message: 'Conta não encontrada.' } });
    }

    const syncRuns = await SyncEngineService.listSyncRuns(prisma, organizationId, accountId);
    return res.json({ success: true, syncRuns });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { code: 'SYNC_RUNS_FETCH_FAILED', message } });
  }
});

app.get('/api/marketplace-accounts/:accountId/sync-runs/:syncRunId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const syncRunId = req.params.syncRunId;

    const syncRun = await SyncEngineService.getSyncRun(prisma, organizationId, syncRunId);
    if (!syncRun) {
      return res.status(404).json({ error: { code: 'SYNC_RUN_NOT_FOUND', message: 'Execução de sincronização não encontrada.' } });
    }

    return res.json({ success: true, syncRun });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { code: 'SYNC_RUN_FETCH_FAILED', message } });
  }
});

app.post('/api/marketplace-accounts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const account = await createMarketplaceAccount(prisma, req.user!.organizationId, {
      marketplace: req.body.marketplace,
      accountName: req.body.accountName || req.body.sellerName || req.body.name,
      sellerId: req.body.sellerId,
      shopId: req.body.shopId,
      externalAccountId: req.body.externalAccountId,
      accessToken: req.body.accessToken || req.body.apiToken || req.body.partnerKey || req.body.appKey,
      isDemo: req.body.isDemo === true
    });

    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.userId,
        action: 'CREATE_MARKETPLACE_ACCOUNT',
        resourceType: 'MARKETPLACE_ACCOUNT',
        resourceId: account.id,
        marketplace: account.marketplace,
        marketplaceAccountId: account.id,
        status: 'SUCCESS'
      }
    });

    return res.status(201).json({ success: true, account: toAccountView(account) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ACCOUNTS] Erro ao criar conta: ${message}`);
    return res.status(400).json({
      error: {
        code: 'ACCOUNT_CREATE_FAILED',
        message: toFriendlyDbErrorMessage(err, 'Não foi possível criar a conta de marketplace.')
      }
    });
  }
});

app.put('/api/marketplace-accounts/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await updateMarketplaceAccount(prisma, req.user!.organizationId, req.params.id, {
      marketplace: req.body.marketplace,
      accountName: req.body.accountName || req.body.sellerName || req.body.name,
      sellerId: req.body.sellerId,
      shopId: req.body.shopId,
      externalAccountId: req.body.externalAccountId,
      accessToken: req.body.accessToken || req.body.apiToken || req.body.partnerKey || req.body.appKey,
      isDemo: req.body.isDemo === true
    });

    if (!updated) {
      return res.status(404).json({
        error: {
          code: 'MARKETPLACE_ACCOUNT_NOT_FOUND',
          message: 'Conta de marketplace não encontrada.'
        }
      });
    }

    return res.json({ success: true, account: toAccountView(updated) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ACCOUNTS] Erro ao atualizar conta: ${message}`);
    return res.status(400).json({
      error: {
        code: 'ACCOUNT_UPDATE_FAILED',
        message: toFriendlyDbErrorMessage(err, 'Não foi possível atualizar a conta de marketplace.')
      }
    });
  }
});

/* ==========================================================================
   ROTAS DE AUTORIZAÇÃO E OAUTH SHOPEE REAL (FASE 4.1)
   ========================================================================== */

app.get('/api/marketplaces/shopee/authorize', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const envParam = (req.query.environment as string)?.trim().toLowerCase();
    const targetEnv = envParam === 'production' ? 'production' : (envParam === 'sandbox' ? 'sandbox' : undefined);
    const { authUrl, diagnostic } = await ShopeeAuthService.generateAuthorizeUrl(
      prisma,
      req.user!.organizationId,
      req.user!.userId,
      undefined,
      targetEnv
    );

    return res.json({
      success: true,
      authUrl,
      diagnostic
    });
  } catch (err: unknown) {
    const code = (err as any)?.code || 'SHOPEE_AUTH_ERROR';
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[SHOPEE-AUTHORIZE-ERROR] [${code}]: ${message}`);

    return res.status(400).json({
      success: false,
      error: message,
      code
    });
  }
});

app.get('/api/marketplaces/shopee/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    const shopId = Number(req.query.shop_id || req.query.shop_id_list);
    const state = req.query.state as string;

    if (!code || !shopId || !state) {
      return res.status(400).send('<h1>Erro 400: Parâmetros OAuth Shopee inválidos ou ausentes.</h1>');
    }

    const statePayload = await ShopeeAuthService.validateAndConsumeState(prisma, state);
    const account = await ShopeeAuthService.handleCallback(prisma, code, shopId, statePayload);

    const frontendUrl = process.env.FRONTEND_URL || 'https://lx-syncmarketplace.lczinz.workers.dev';
    return res.redirect(`${frontendUrl}/?section=channels&connection=success&provider=shopee&account_id=${account.id}`);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SHOPEE-CALLBACK-ERROR]', message);
    if (err?.code === 'OAUTH_STATE_ALREADY_USED') {
      return res.status(400).send('<h1>Erro 400: State de autorização já utilizado anteriormente (Replay Attack bloqueado).</h1>');
    }
    if (err?.code === 'OAUTH_STATE_EXPIRED') {
      return res.status(400).send('<h1>Erro 400: State de autorização expirado (expiração de 10 minutos).</h1>');
    }
    return res.status(400).send(`<h1>Erro 400 ao autorizar loja Shopee: ${message}</h1>`);
  }
});

app.post('/api/marketplaces/shopee/disconnect', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({ success: false, error: 'accountId é obrigatório.' });
    }

    const disconnected = await ShopeeAuthService.disconnectAccount(
      prisma,
      req.user!.organizationId,
      req.user!.userId,
      accountId
    );

    if (!disconnected) {
      return res.status(404).json({ success: false, error: 'Conta Shopee não encontrada.' });
    }

    return res.json({ success: true, message: 'Conta Shopee desconectada com sucesso.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.get('/api/marketplaces/shopee/connection-status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accounts = await prisma.marketplaceAccount.findMany({
      where: { organizationId: req.user!.organizationId, marketplace: 'shopee', isDemo: false }
    });

    return res.json({
      success: true,
      hasRealConnection: accounts.length > 0,
      accounts: accounts.map(a => ({
        id: a.id,
        accountName: a.accountName,
        shopId: a.shopId ? `${a.shopId.slice(0, 3)}****${a.shopId.slice(-2)}` : undefined,
        status: a.status,
        lastSyncAt: a.lastSyncAt,
        tokenExpiresAt: a.tokenExpiresAt
      }))
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.delete('/api/marketplace-accounts/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await deleteMarketplaceAccount(prisma, req.user!.organizationId, req.params.id);
    if (deleted === 0) {
      return res.status(404).json({
        error: {
          code: 'MARKETPLACE_ACCOUNT_NOT_FOUND',
          message: 'Conta de marketplace não encontrada.'
        }
      });
    }
    return res.json({ success: true, message: 'Conta de marketplace removida.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ACCOUNTS] Erro ao excluir conta: ${message}`);
    return res.status(500).json({
      error: {
        code: 'ACCOUNT_DELETE_FAILED',
        message: toFriendlyDbErrorMessage(err, 'Não foi possível remover a conta de marketplace.')
      }
    });
  }
});

app.post('/api/marketplace-accounts/:id/import', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accountId = req.params.id;
    const account = await findAccountByOrg(prisma, req.user!.organizationId, accountId);

    if (!account) {
      return res.status(404).json({
        error: {
          code: 'MARKETPLACE_ACCOUNT_NOT_FOUND',
          message: 'Conta de marketplace não encontrada.'
        }
      });
    }

    const summary = await ImportService.executeImportJob(
      prisma,
      {
        id: account.id,
        organizationId: account.organizationId,
        marketplace: account.marketplace,
        accountName: account.accountName
      },
      req.user!.email
    );

    return res.json({
      success: true,
      jobId: summary.jobId,
      status: summary.status,
      accountId: account.id,
      message: summary.message,
      summary
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[IMPORT] Erro na importação da conta ${req.params.id}: ${message}`);
    return res.status(500).json({
      error: {
        code: 'IMPORT_JOB_FAILED',
        message: toFriendlyDbErrorMessage(err, 'Falha ao importar os anúncios da conta.')
      }
    });
  }
});

app.get('/api/marketplace-listings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const marketplaceFilter = req.query.marketplace as string | undefined;
    const result = await listMarketplaceListings(prisma, req.user!.organizationId, marketplaceFilter);
    return res.json({
      success: true,
      listings: result.listings,
      totalListings: result.totalListings,
      totalVariations: result.totalVariations
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LISTINGS] Erro ao listar anúncios: ${message}`);
    return res.status(500).json({
      error: {
        code: 'LISTINGS_FETCH_FAILED',
        message: toFriendlyDbErrorMessage(err, 'Não foi possível carregar os anúncios do servidor.')
      }
    });
  }
});

/* ==========================================================================
   ROTAS DE GRUPOS DE PRODUTOS & MATCHING MULTICANAL
   ========================================================================== */

app.get('/api/product-groups', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string | undefined,
      marketplace: req.query.marketplace as string | undefined,
      status: req.query.status as string | undefined
    };
    const result = await GroupsService.listGroupedProducts(prisma, req.user!.organizationId, filters);
    return res.json({
      success: true,
      groups: result.groups,
      groupedProducts: result.groups,
      unlinkedListings: result.unlinkedListings,
      reviewSuggestions: result.reviewSuggestions,
      summary: result.summary
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[GROUPS] Erro ao listar produtos agrupados: ${message}`);
    return res.status(500).json({
      error: { code: 'GROUPS_FETCH_FAILED', message: toFriendlyDbErrorMessage(err, 'Não foi possível listar os grupos de produtos.') }
    });
  }
});

app.get(['/api/product-groups/pending', '/api/product-groups/review-suggestions'], authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pendingMatches = await GroupsService.getPendingMatches(prisma, req.user!.organizationId);
    return res.json({ success: true, pendingMatches, reviewSuggestions: pendingMatches, totalPending: pendingMatches.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[GROUPS] Erro ao listar pendências de matching: ${message}`);
    return res.status(500).json({
      error: { code: 'PENDING_MATCHES_FAILED', message: toFriendlyDbErrorMessage(err, 'Não foi possível buscar pendências de matching.') }
    });
  }
});

app.post('/api/product-groups/confirm-match', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mappingId } = req.body;
    if (!mappingId) return res.status(400).json({ error: { code: 'MAPPING_ID_REQUIRED', message: 'mappingId é obrigatório.' } });
    await GroupsService.confirmMapping(prisma, mappingId);
    return res.json({ success: true, message: 'Vínculo confirmado com sucesso.' });
  } catch (err: unknown) {
    return res.status(400).json({ error: { code: 'CONFIRM_MATCH_FAILED', message: (err as Error).message } });
  }
});

app.post('/api/product-groups/reject-match', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mappingId } = req.body;
    if (!mappingId) return res.status(400).json({ error: { code: 'MAPPING_ID_REQUIRED', message: 'mappingId é obrigatório.' } });
    await GroupsService.rejectMapping(prisma, mappingId);
    return res.json({ success: true, message: 'Vínculo rejeitado com sucesso.' });
  } catch (err: unknown) {
    return res.status(400).json({ error: { code: 'REJECT_MATCH_FAILED', message: (err as Error).message } });
  }
});

app.post('/api/product-groups/link', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { masterProductId, marketplaceListingId } = req.body;
    if (!masterProductId || !marketplaceListingId) {
      return res.status(400).json({ error: { code: 'PARAMS_REQUIRED', message: 'masterProductId e marketplaceListingId são obrigatórios.' } });
    }
    await GroupsService.linkListing(prisma, req.user!.organizationId, masterProductId, marketplaceListingId);
    return res.json({ success: true, message: 'Anúncio vinculado manualmente ao produto mestre.' });
  } catch (err: unknown) {
    return res.status(400).json({ error: { code: 'LINK_FAILED', message: (err as Error).message } });
  }
});

app.post('/api/product-groups/rematch', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await GroupsService.runRematching(prisma, req.user!.organizationId);
    return res.json({
      success: true,
      message: `Re-análise concluída: ${result.groupsCreated} grupo(s) criado(s), ${result.automaticLinks} vínculo(s) automático(s) e ${result.reviewSuggestions} sugestão(ões).`,
      result
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: { code: 'REMATCH_FAILED', message: (err as Error).message } });
  }
});

app.post('/api/product-groups/unlink', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { masterProductId, marketplaceListingId } = req.body;
    if (!masterProductId || !marketplaceListingId) {
      return res.status(400).json({ error: { code: 'PARAMS_REQUIRED', message: 'masterProductId e marketplaceListingId são obrigatórios.' } });
    }
    await GroupsService.unlinkListing(prisma, req.user!.organizationId, masterProductId, marketplaceListingId);
    return res.json({ success: true, message: 'Vínculo removido com sucesso.' });
  } catch (err: unknown) {
    return res.status(400).json({ error: { code: 'UNLINK_FAILED', message: (err as Error).message } });
  }
});

app.post('/api/product-groups/merge', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sourceMasterProductId, targetMasterProductId } = req.body;
    if (!sourceMasterProductId || !targetMasterProductId) {
      return res.status(400).json({ error: { code: 'PARAMS_REQUIRED', message: 'sourceMasterProductId e targetMasterProductId são obrigatórios.' } });
    }
    await GroupsService.mergeGroups(prisma, req.user!.organizationId, sourceMasterProductId, targetMasterProductId);
    return res.json({ success: true, message: 'Grupos fundidos com sucesso.' });
  } catch (err: unknown) {
    return res.status(400).json({ error: { code: 'MERGE_FAILED', message: (err as Error).message } });
  }
});

app.post('/api/product-groups/split', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sourceMasterProductId, listingIdsToExtract, newGroupName, newMasterSku } = req.body;
    if (!sourceMasterProductId || !listingIdsToExtract || !newGroupName || !newMasterSku) {
      return res.status(400).json({ error: { code: 'PARAMS_REQUIRED', message: 'Parâmetros de divisão são obrigatórios.' } });
    }
    const newGroupId = await GroupsService.splitGroup(prisma, req.user!.organizationId, sourceMasterProductId, listingIdsToExtract, newGroupName, newMasterSku);
    return res.json({ success: true, message: 'Grupo dividido com sucesso.', newGroupId });
  } catch (err: unknown) {
    return res.status(400).json({ error: { code: 'SPLIT_FAILED', message: (err as Error).message } });
  }
});

app.post('/api/product-groups/create-manual', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, masterSku, listingIds } = req.body;
    if (!name || !masterSku) {
      return res.status(400).json({ error: { code: 'PARAMS_REQUIRED', message: 'Nome e SKU mestre são obrigatórios.' } });
    }
    const groupId = await GroupsService.createManualGroup(prisma, req.user!.organizationId, name, masterSku, listingIds || []);
    return res.json({ success: true, message: 'Grupo mestre criado manualmente com sucesso.', groupId });
  } catch (err: unknown) {
    return res.status(400).json({ error: { code: 'CREATE_GROUP_FAILED', message: (err as Error).message } });
  }
});

app.post('/api/product-groups/preview-edit', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { scope, field, newValue, masterProductId, listingId, variationId } = req.body;
    const marketplaces = ['shopee', 'mercadolivre', 'tiktok', 'amazon'];
    const previews = marketplaces.map(mp => MarketplaceRulesService.validateFieldChange(mp, field, newValue));

    return res.json({
      success: true,
      scope,
      field,
      newValue,
      previews
    });
  } catch (err: unknown) {
    return res.status(400).json({ error: { code: 'PREVIEW_EDIT_FAILED', message: (err as Error).message } });
  }
});

app.get('/api/product-groups/export', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await GroupsService.listGroupedProducts(prisma, req.user!.organizationId);
    
    // Geração de CSV completo
    let csv = 'Master SKU,Nome do Produto,Estoque Total,Nº de Anúncios,Nº de Variações,Marketplaces Vinculados\n';
    result.groups.forEach(g => {
      const mps = g.listings.map(l => l.marketplace).join(';');
      csv += `"${g.masterSku}","${g.name}",${g.totalStock},${g.listingsCount},${g.variationsCount},"${mps}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="produtos_agrupados.csv"');
    return res.send(csv);
  } catch (err: unknown) {
    return res.status(500).json({ error: { code: 'EXPORT_FAILED', message: (err as Error).message } });
  }
});

app.get('/api/marketplace-listings/export-csv', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await listMarketplaceListings(prisma, req.user!.organizationId);
    
    let csv = 'ID Anúncio,Marketplace,Conta,Título,Status,Nº Variações,Canais Vinculados\n';
    result.listings.forEach(l => {
      const linked = l.linkedChannels.map(c => c.marketplace).join(';');
      csv += `"${l.externalListingId}","${l.account.marketplace}","${l.account.accountName}","${l.title.replace(/"/g, '""')}","${l.status}",${l.variations.length},"${linked}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="todos_anuncios_catalog.csv"');
    return res.send(csv);
  } catch (err: unknown) {
    return res.status(500).json({ error: { code: 'EXPORT_FAILED', message: (err as Error).message } });
  }
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

app.get('/api/audit-logs', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return res.json({ success: true, logs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.post('/api/marketplace-listings/:id/edit', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, status, price, stock, categoryId, variations } = req.body;
    const listingId = req.params.id;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: { variations: true }
    });

    if (!listing || listing.organizationId !== req.user!.organizationId) {
      return res.status(404).json({ error: { code: 'LISTING_NOT_FOUND', message: 'Anúncio não encontrado.' } });
    }

    const updated = await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: {
        title: title !== undefined ? title : listing.title,
        description: description !== undefined ? description : listing.description,
        status: status !== undefined ? status : listing.status,
        categoryId: categoryId !== undefined ? categoryId : listing.categoryId,
        updatedAt: new Date()
      }
    });

    if (Array.isArray(variations)) {
      for (const v of variations) {
        if (v.id) {
          await prisma.marketplaceVariation.update({
            where: { id: v.id },
            data: {
              variationName: v.variationName !== undefined ? v.variationName : undefined,
              currentSku: v.currentSku !== undefined ? v.currentSku : undefined,
              price: v.price !== undefined ? Number(v.price) : undefined,
              stock: v.stock !== undefined ? Number(v.stock) : undefined,
              status: v.status !== undefined ? v.status : undefined,
              updatedAt: new Date()
            }
          });
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.userId,
        action: 'UPDATE_MARKETPLACE_LISTING',
        resourceType: 'MARKETPLACE_LISTING',
        resourceId: listingId,
        status: 'SUCCESS'
      }
    });

    return res.json({ success: true, listing: updated, message: 'Anúncio atualizado com sucesso.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { code: 'EDIT_LISTING_FAILED', message } });
  }
});

app.post('/api/sku-changes/jobs/:id/retry-failed', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const job = dbStore.skuJobs.find(j => j.id === req.params.id) as any;
  if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado.' });

  const failedItems = (job.items || []).filter((i: any) => i.status === 'FAILED');
  if (failedItems.length === 0) {
    return res.status(400).json({ success: false, error: 'Nenhum item com falha para repetir.' });
  }

  const retryJobId = `job-retry-${Date.now()}`;
  const result = await SkuQueueService.processJob(retryJobId, req.user!.organizationId, failedItems);

  return res.json({ success: true, retryJobId, result, message: `Repetição iniciada para ${failedItems.length} item(ns).` });
});

/* ==========================================
   ROTAS DE GESTÃO E UPLOAD DE IMAGENS (FASE 3)
   ========================================== */

app.post('/api/uploads/images', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename, dataUrl } = req.body;

    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'Dados da imagem em base64 (dataUrl) são obrigatórios.' });
    }

    const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, error: 'Formato dataUrl base64 inválido.' });
    }

    const buffer = Buffer.from(matches[2], 'base64');
    const imageMeta = ImageStorageService.processUpload(req.user!.organizationId, filename || 'imagem-anuncio.png', buffer);

    return res.json({
      success: true,
      image: imageMeta
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: message });
  }
});

app.get('/api/marketplace-listings/:id/images', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const listingId = req.params.id;
    const images = await prisma.marketplaceListingImage.findMany({
      where: { marketplaceListingId: listingId, organizationId: req.user!.organizationId },
      orderBy: { position: 'asc' }
    });
    return res.json({ success: true, images });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.post('/api/marketplace-listings/:id/images', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const listingId = req.params.id;
    const { url, storageKey, isPrimary, altText, mimeType, fileSize } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL da imagem é obrigatória.' });
    }

    if (isPrimary) {
      await prisma.marketplaceListingImage.updateMany({
        where: { marketplaceListingId: listingId },
        data: { isPrimary: false }
      });
    }

    const count = await prisma.marketplaceListingImage.count({ where: { marketplaceListingId: listingId } });

    const newImg = await prisma.marketplaceListingImage.create({
      data: {
        organizationId: req.user!.organizationId,
        marketplaceListingId: listingId,
        url,
        storageKey,
        position: count,
        isPrimary: isPrimary || count === 0,
        altText,
        mimeType,
        fileSize
      }
    });

    if (newImg.isPrimary) {
      await prisma.marketplaceListing.update({
        where: { id: listingId },
        data: { imageUrl: url, updatedAt: new Date() }
      });
    }

    return res.json({ success: true, image: newImg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.patch('/api/marketplace-listings/:id/images/:imageId/primary', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: listingId, imageId } = req.params;

    // Reseta todas as imagens do anúncio para isPrimary = false
    await prisma.marketplaceListingImage.updateMany({
      where: { marketplaceListingId: listingId, organizationId: req.user!.organizationId },
      data: { isPrimary: false }
    });

    // Define a imagem alvo como a única principal
    const updatedImg = await prisma.marketplaceListingImage.update({
      where: { id: imageId },
      data: { isPrimary: true, updatedAt: new Date() }
    });

    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { imageUrl: updatedImg.url, updatedAt: new Date() }
    });

    return res.json({ success: true, image: updatedImg, message: 'Imagem definida como principal com sucesso.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.delete('/api/marketplace-listings/:id/images/:imageId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: listingId, imageId } = req.params;

    const img = await prisma.marketplaceListingImage.findFirst({
      where: { id: imageId, marketplaceListingId: listingId, organizationId: req.user!.organizationId }
    });

    if (!img) {
      return res.status(404).json({ success: false, error: 'Imagem não encontrada.' });
    }

    await prisma.marketplaceListingImage.delete({ where: { id: imageId } });

    // Se era a imagem principal, define a primeira restante como principal
    if (img.isPrimary) {
      const remaining = await prisma.marketplaceListingImage.findFirst({
        where: { marketplaceListingId: listingId },
        orderBy: { position: 'asc' }
      });

      if (remaining) {
        await prisma.marketplaceListingImage.update({
          where: { id: remaining.id },
          data: { isPrimary: true }
        });
        await prisma.marketplaceListing.update({
          where: { id: listingId },
          data: { imageUrl: remaining.url }
        });
      } else {
        await prisma.marketplaceListing.update({
          where: { id: listingId },
          data: { imageUrl: null }
        });
      }
    }

    return res.json({ success: true, message: 'Imagem excluída com sucesso.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.patch('/api/marketplace-variations/:id/image', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const variationId = req.params.id;
    const { imageUrl } = req.body;

    const variation = await prisma.marketplaceVariation.findUnique({ where: { id: variationId } });
    if (!variation || variation.organizationId !== req.user!.organizationId) {
      return res.status(404).json({ success: false, error: 'Variação não encontrada.' });
    }

    const updated = await prisma.marketplaceVariation.update({
      where: { id: variationId },
      data: { imageUrl: imageUrl || null, updatedAt: new Date() }
    });

    return res.json({ success: true, variation: updated, message: 'Imagem da variação atualizada.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

app.patch('/api/master-products/:id/primary-image', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const masterProductId = req.params.id;
    const { imageUrl } = req.body;

    const mp = await prisma.masterProduct.findUnique({ where: { id: masterProductId } });
    if (!mp || mp.organizationId !== req.user!.organizationId) {
      return res.status(404).json({ success: false, error: 'Produto Mestre não encontrado.' });
    }

    const updated = await prisma.masterProduct.update({
      where: { id: masterProductId },
      data: { imageUrl, updatedAt: new Date() }
    });

    return res.json({ success: true, masterProduct: updated, message: 'Imagem central do Produto Mestre atualizada.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

/* ==========================================================================
   ENDPOINTS ADMINISTRATIVOS DE AUDITORIA E LIMPEZA DEMO (FASE 4.1.3)
   Acesso restrito estritamente a usuários com e-mail cadastrado em isAdminEmail
   ========================================================================== */

app.get('/api/admin/cleanup-demo/dry-run', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAdminEmail(req.user?.email || '')) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Acesso restrito a administradores do sistema.' } });
    }

    const demoAccounts = await prisma.marketplaceAccount.findMany({
      where: { isDemo: true },
      select: { id: true, marketplace: true, accountName: true, shopId: true, organizationId: true, isDemo: true }
    });

    const realAccounts = await prisma.marketplaceAccount.findMany({
      where: { isDemo: false },
      select: { id: true, marketplace: true, accountName: true, shopId: true, organizationId: true, isDemo: true }
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

    return res.json({
      success: true,
      dryRun: true,
      report: {
        demoAccountsCount: demoAccounts.length,
        realAccountsCount: realAccounts.length,
        demoListingsCount,
        realListingsCount,
        demoVariationsCount,
        realVariationsCount,
        demoImagesCount,
        realImagesCount,
        demoAccounts,
        realAccounts
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { code: 'ADMIN_DRYRUN_FAILED', message } });
  }
});

app.post('/api/admin/cleanup-demo', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (process.env.ALLOW_DEMO_CLEANUP !== 'true') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint indisponível.' } });
    }

    if (!isAdminEmail(req.user?.email || '')) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Acesso restrito a administradores do sistema.' } });
    }

    if (req.body?.confirm !== 'REMOVE_DEMO_DATA') {
      return res.status(400).json({ error: { code: 'INVALID_CONFIRMATION', message: 'Confirmação inválida. Envie {"confirm": "REMOVE_DEMO_DATA"}.' } });
    }

    const cleanupResult = await cleanupDemoData(prisma);

    // Registro no AuditLog
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.userId,
        action: 'ADMIN_DEMO_CLEANUP',
        resourceType: 'MARKETPLACE_ACCOUNT',
        resourceId: 'ALL_DEMO_ACCOUNTS',
        newValueJson: JSON.stringify({
          adminEmail: req.user!.email,
          cleanupResult,
          executedAt: new Date().toISOString()
        })
      }
    });

    const remainingRealAccounts = await prisma.marketplaceAccount.findMany({
      where: { isDemo: false },
      select: { id: true, marketplace: true, accountName: true, shopId: true, isDemo: true }
    });

    return res.json({
      success: true,
      message: 'Limpeza administrativa concluída com sucesso no PostgreSQL.',
      cleanupResult,
      preservedRealAccounts: remainingRealAccounts
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { code: 'ADMIN_CLEANUP_FAILED', message } });
  }
});

const healthHandlerLive = (req: Request, res: Response) => {
  return res.status(200).json({ status: 'ok', service: 'lx-sync-api', uptime: process.uptime() });
};

const healthHandlerReady = (req: Request, res: Response) => {
  return res.status(200).json({ status: 'ok', service: 'lx-sync-api', db: 'CONNECTED' });
};

const healthHandlerWorker = (req: Request, res: Response) => {
  return res.status(200).json({ status: 'ok', service: 'lx-sync-api', worker: 'ACTIVE', queue: 'SKU_JOB_QUEUE' });
};

app.get('/health', healthHandlerLive);
app.get('/health/live', healthHandlerLive);
app.get('/health/ready', healthHandlerReady);
app.get('/health/worker', healthHandlerWorker);

app.get('/api/health', healthHandlerLive);
app.get('/api/health/live', healthHandlerLive);
app.get('/api/health/ready', healthHandlerReady);
app.get('/api/health/worker', healthHandlerWorker);

// Fallback JSON 404 Middleware para qualquer rota /api inexistente
app.use('/api', (req: Request, res: Response) => {
  return res.status(404).json({
    error: {
      code: 'API_ROUTE_NOT_FOUND',
      message: 'Rota da API não encontrada.'
    }
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 LX Sync Backend Server (Fase 4.1.3) rodando na porta ${PORT}`);
  try {
    if (process.env.ENABLE_DEMO_SEED === 'true') {
      const seedRes = await ensureDemoData(prisma);
      console.log('[BOOT] Demo seed ativado:', seedRes);
    } else {
      console.log('[BOOT] Produção: ENABLE_DEMO_SEED != true. Seed DEMO desativado (Nenhuma exclusão no boot).');
    }
  } catch (e: any) {
    console.warn('[BOOT] Gerenciamento de seed DEMO no boot:', e.message);
  }
});
