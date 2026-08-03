# 🚀 LX Sync Marketplace - Relatório Completo do Projeto

Este documento resume todas as funcionalidades, módulos, identidade visual e arquitetura desenvolvidos na plataforma **LX Sync Marketplace**.

---

## 🎨 Identidade Visual & Design System

- **Paleta de Cores**: Red Crimson Dark (`#0A090B` Fundo, `#161316` Cards, `#EF4444` Acento Principal, Gradiente Vermelho Carmesim).
- **Logotipo Principal**: Ícone vetorial da fachada de loja neon vermelha com efeito glow (`assets/logo.svg`).
- **Estilo de Interface**: Glassmorphism moderno com bordas translúcidas, sombras iluminadas, badges neon e tipografia Inter.

---

## 🌟 Módulos e Funcionalidades Desenvolvidos

### 1. 🌐 Gestão de Múltiplas Contas por Plataforma
- Permite cadastrar e gerenciar **múltiplas contas/lojas simultâneas** em cada marketplace:
  - **Mercado Livre** (ex: *Loja Principal*, *Loja Mercado Livre*)
  - **Shopee** (ex: *Festum Decor - Shopee Oficial*)
  - **TikTok Shop**
  - **Amazon BR**
- Cada conta possui Seller ID / Shop ID próprio, status de conexão ativo, tag **CONTA DE DEMONSTRAÇÃO** para contas em modo simulado e chaves criptografadas via AES-256-GCM.

---

### 2. 🚀 Publicador Multi-Post com Upload Direto por Drag & Drop
- Cadastro único de produto (Título, SKU Master, Preço, Estoque Efetivo, Categoria e Descrição).
- **Upload Direto por Drag & Drop**: Suporte a seleção de múltiplas imagens (JPG, PNG, WEBP até 5MB) com preview em miniaturas, ordenação e indicação da imagem `PRINCIPAL` (`⭐`).
- Checklist interativo para selecionar em quais contas publicar simultaneamente.
- Disparo paralelo com barra de progresso visual em tempo real por conta.

---

### 3. 🛒 Anúncios & SKUs (MatchingEngine & De-Para Centralizado)
- **Desduplicação e Match Inteligente (`MatchingService`)**:
  - Normalização de títulos (remoção de ruídos comerciais) e SKUs.
  - Cálculo automático da confiança de equivalência (0% a 100%) entre anúncios de múltiplos canais.
  - Decomposição de SKUs da Festum Decor (`Z - Red50 - Zoologico - 04`) em Prefixo, Tamanho/Tipo, Tema e Código da Estampa.
- Tabela interativa De-Para conectando os anúncios aos Produtos Mestres.
- Botões de ajuste rápido com sincronização e regra de prevenção contra **overselling** (buffer de segurança).

---

### 4. ✏️ Padronização em Lote de SKUs, Fila Assíncrona & Rollback/Desfazer
- **Motor de Transformações (`TransformationService`)**:
  - Suporte às regras: `SET_EXACT`, `REPLACE_TEXT`, `REMOVE_TEXT`, `ADD_PREFIX`, `ADD_SUFFIX`, `UPPERCASE`, `LOWERCASE`, `TRIM`, `NORMALIZE_SPACES`, `NORMALIZE_SEPARATORS`, `USE_MASTER_SKU`, `APPLY_TEMPLATE`.
- **Pré-Visualização Imutável (`PreviewService`)**:
  - Resolução em 11 alcances de seleção (`SINGLE_LISTING`, `SINGLE_VARIATION`, `SELECTED_LISTINGS`, `SELECTED_VARIATIONS`, `ALL_FILTERED`, `ALL_ACTIVE`, `SPECIFIC_ACCOUNTS`, `SPECIFIC_MARKETPLACES`, `SPECIFIC_SKUS`, `MASTER_PRODUCT`, `SYNC_GROUP`).
  - Geração de hash SHA-256 de integridade e bloqueio automático de divergências.
- **Fila Assíncrona com Idempotência (`SkuQueueService`)**:
  - Processamento em lote com chave de idempotência SHA-256 por item.
  - Suporte a pausa, retomada, cancelamento, repetição de falhas e re-confirmação do SKU no adapter (`confirmSkuChange`).
- **Mecanismo de Desfazer (`RollbackService`)**:
  - Prévia e execução de Rollback que restaura o SKU original criando um novo Job reverso com `rollbackOfJobId` sem apagar o histórico auditável.

---

### 5. 🔍 LX Marketplace Analyzer (Métricas & Análise de Concorrência)
- Simulação e estimativa de vendas e faturamento nos últimos 30 dias para qualquer produto ou categoria.
- Cálculo de comissões médias por marketplace.
- Sugestão automática de títulos campeões SEO otimizados para conversão.

---

### 6. 🔒 Autenticação Google OAuth Real (Identity Services) JWT & Controle RBAC
- **Login real com Google Identity Services (GIS)**: botão oficial do Google renderizado via `google.accounts.id.renderButton` (substituindo o antigo login simulado por `prompt()`).
- O frontend envia **somente o Google ID Token** (`credential`) ao backend — nunca e-mail/nome/avatar digitados.
- **Validação estrita no servidor (`verifyGoogleToken`)** com `verifyIdToken`:
  - Assinatura criptográfica válida, `audience` igual ao `GOOGLE_CLIENT_ID`, `issuer` = `accounts.google.com` e `email_verified === true`.
  - **Nenhum fallback** é permitido: tokens inválidos sempre geram erro.
- Rejeição de payloads inseguros (`email`, `name`, `avatar`, `token` direto) com respostas de erro estruturadas (`GOOGLE_CREDENTIAL_REQUIRED`, `INVALID_GOOGLE_CREDENTIAL`, `EMAIL_NOT_AUTHORIZED`).
- Emissão de JWT de sessão (24h) com **`JWT_SECRET` obrigatório** e envio automático de `Authorization: Bearer <token>` em 100% das chamadas HTTP; validação de sessão via `GET /api/auth/me`.
- **E-mails Administradores Autorizados** (via env `ADMIN_EMAILS`):
  - `lucasoliveiradossantos008@gmail.com`
  - `festumcontato@gmail.com`
- Bloqueio estrito de contas não autorizadas com mensagem amigável no cliente.
- **Hardening de configuração**: `backend/.env` removido do versionamento (segredos fora do git), `.env.example` documentando `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAILS` e `FRONTEND_URL`.
- **Diagnóstico no boot do servidor**: log mascarado do `GOOGLE_CLIENT_ID` em uso, status do `JWT_SECRET` e quantidade de e-mails admin autorizados.

---

### 7. 🔔 Componente de Notificações Toast UI & Limpeza de Dados
- Substituição total de alertas nativos (`alert()`) por notificações visuais interativas (`showNotification()`) com cores por severidade (Verde, Vermelho, Amarelo, Azul).
- **Migrador Automático de Armazenamento (`APP_STORAGE_VERSION = 5`)**: purga automática de contas legadas (`lx_accounts`, `marketplaceAccounts`, `selectedAccountId`, etc.) nos navegadores — a fonte de contas passou a ser exclusivamente o backend (ver seção 10).

---

### 8. 📋 Logs de Auditoria & Exportação CSV
- Histórico transparente e persistido no banco de dados de todas as movimentações e operações de lote.
- Filtros por canal e status.
- Exportação em arquivo CSV.

---

### 9. 🧪 Suíte de Testes Automatizados
- **Backend (22 testes + fase 3)**: validação de e-mails admin, criptografia AES-256-GCM, adapter simulado e segurança do OAuth; contrato do `/api/auth/google` (rejeição de credential ausente, texto aleatório, e-mail como token e JWT falso) e JWT interno (geração, verificação e rejeição de secret diferente).
- **Frontend (10 testes)**: detecção de IDs legados (`acc-shopee-1785758705262`), extração/normalização de contas da API, migração v5 (remoção de chaves legadas preservando SKUs), fonte única sem fallback local, detecção de 404 `MARKETPLACE_ACCOUNT_NOT_FOUND` e conta DEMO somente quando o backend envia `isDemo=true`.

---

### 10. 📋 Relatório Final — Correção da Fonte de Contas (API como Única Fonte)

**1. Origem exata do ID antigo (`acc-shopee-1785758705262`):**
- Gerado localmente no navegador por `StorageService.addAccount()` (`services/storage.js`, padrão `acc-${platform}-${Date.now()}`) ao cadastrar uma conta na aba "Canais & APIs".
- O ID **nunca existiu no PostgreSQL** — era apenas um cache local (`lx_accounts` no `localStorage`), o que causava o erro 404 na importação e o encerramento da sessão de uso daquele ID.

**2. Chaves de contas legadas removidas na migração v5:**
- `lx_accounts`, `marketplaceAccounts`, `connectedAccounts`, `selectedAccountId`, `publisherSelectedAccounts`, `demoAccounts`, `accounts` + varredura de qualquer chave contendo `account`/`conta`/`marketplace` (inclui IDs `acc-<mp>-<timestamp>` no conteúdo).
- `StorageService.getAccounts/saveAccounts/addAccount/updateAccount/deleteAccount` agora são stubs (não persistem contas) — **proibido qualquer fallback local**.

**3. Resposta de `GET /api/marketplace-accounts` (fonte única):**
- Lista real vinda do PostgreSQL via Prisma: `{ success: true, accounts: [...] }` com `id`, `marketplace`, `accountName`, `sellerId`, `shopId`, `status`, `isDemo`, `lastSyncAt`, `lastImportAt`.
- *(Validação do corpo da resposta no ambiente público: pendente do teste público pós-deploy.)*

**4. ID real utilizado (nenhum timestamp local):**
- Conta DEMO criada no banco: **`acc-shopee-demo`** (org `org-festum-decor`, "Festum Decor", Shopee, `isDemo=true`, modo simulado), via upsert idempotente de `ensureDemoData()` protegido por `ENABLE_DEMO_SEED=true`.
- O botão "Importar Anúncios" usa exclusivamente `data-account-id` da lista da API.

**5. Conta DEMO criada no PostgreSQL:** Sim (se `ENABLE_DEMO_SEED=true`).

**6. URL final de importação:** `POST https://lx-sync-api.onrender.com/api/marketplace-accounts/:id/import` (contrato inalterado) — passa a persistir `ImportJob`, `MarketplaceListing` e `MarketplaceVariation` via Prisma.
- **Teste público pós-deploy (validado):** a importação DEMO funcionou no ambiente público — 2 anúncios criados, 0 atualizados, 4 variações sincronizadas (com o dataset antigo).

**6b. Conjunto DEMO expandido (`demo-data.ts`):**
- Gerador determinístico `generateDemoMarketplaceData()` (IDs fixos `FDM-0001...`, sem `Date.now()`) usado pelo `FakeMarketplaceAdapter` — **50 anúncios / 129 variações** (1–5 variações por anúncio).
- 7 temas reais Festum Decor (Zoologico 04, Jardim Encantado 12, Setembro Amarelo 03, Natal 08, Fundo do Mar 05, Infantil 07, Arraia 02) × 6 tipos (Painel Redondo, Redondo Grande, Cilindro, Banner Retangular, Capa de Porta, Topper pausado).
- SKUs reais: `Z - Red50 - Zoologico - 04`, `Ret H 150_220 - Fundo do Mar - 05`, `Rom200 - Setembro Amarelo - 03`, `DFRom200 - Natal - 08`, `CPM140 - Arraia - 02`, `Port85 - Infantil - 07`, etc.
- Casos especiais de MatchingService: SKU idêntico em anúncios distintos (licenciada), variações de espaços/separadores (`Z-Red100-Zoologico-04`), caixa baixa (`z - red80 - zoologico - 04`), títulos semelhantes, mesmo tema/código com medidas diferentes, anúncios SEM SKU, SKUs parcialmente incompatíveis (código igual/tema diferente) e anúncio premium com 5 variações.
- Estados variados: anúncios ativos e pausados, variações com estoque zero e estoque baixo, preços distintos por tema/tamanho.
- Importação idempotente: 1ª importação cria, 2ª atualiza (upsert por `marketplaceAccountId_externalListingId` / `marketplaceListingId_externalVariationId`), sem duplicatas; `ImportService.executeImportJob` aceita adapter opcional (produção inalterada).
- **Isolamento**: o dataset só é usado pelo adapter DEMO da conta `acc-shopee-demo` — nunca se mistura com contas reais; `ENABLE_DEMO_SEED=true` continua sendo a proteção de ativação.

**6c. Tela "Anúncios & SKUs" conectada ao PostgreSQL (`GET /api/marketplace-listings`):**
- Nova rota autenticada `GET /api/marketplace-listings` (Bearer JWT) no server.ts → `listMarketplaceListings()` (novo `listings.service.ts`): lê `MarketplaceListing` + `MarketplaceVariation` + `MarketplaceAccount` do Prisma, **filtrado por `organizationId`** do usuário logado (nunca expõe tokens/segredos da conta — só marketplace, nome e `isDemo`).
- Resposta: `{ success, listings, totalListings, totalVariations }` — ordenada por `externalListingId` (FDM-0001...), cada anúncio com `variations` (SKU, preço, estoque, status).
- Frontend: `ListingsAPI.getListings()` agora chama `/api/marketplace-listings` (antes apontava para `/api/listings` inexistente → 404); ao **abrir a aba "Anúncios & SKUs"** (`switchTab('skus')`) o app dispara `loadMarketplaceListings()` e renderiza tabela com os anúncios importados + variações (SKU · preço · estoque colorido para zero/baixo), contador "X anúncio(s) · Y variação(ões)", badge de status e botão "Atualizar" (`btn-refresh-listings`).
- Esperado no ambiente público: `GET /api/marketplace-listings` com **HTTP 200** exibindo **50 anúncios / 129 variações** (conjunto DEMO importado).
- Fallback de erro: mensagem amigável na tabela + console.error; contagens zeradas sem quebrar a tela.

**7. Tratamento 404 no frontend:** remoção do card da conta, recarga da lista via `GET /api/marketplace-accounts`, aviso "Esta conta não existe mais. A lista de contas foi atualizada." e **nenhum reenvio automático** do POST.

**8. Publicador Multi-Post:** usa somente as contas vindas da API; IDs selecionados que não existem mais no backend bloqueiam a publicação com aviso e recarregam a lista.

**9. Arquivos alterados:**
- Frontend: `app.js`, `services/account-source.js` (novo), `services/storage.js`, `services/api/accounts-api.js`, `services/sync-engine.js`, `services/batch-publisher.js`, `tests/account-source.test.js` (novo), `package.json`, `services/api/listings-api.js`, `index.html`.
- Backend: `src/server.ts`, `src/services/accounts.service.ts` (novo), `src/services/demo-seed.service.ts` (novo), `src/services/import.service.ts`, `src/utils/prisma-errors.ts` (novo), `prisma/seed.ts`, `package.json`, `.env.example`, `prisma/migrations/**` (novo), `src/marketplaces/demo-data.ts` (novo), `src/marketplaces/fake-marketplace.adapter.ts`, `src/tests/demo-data.test.ts` (novo), `src/services/listings.service.ts` (novo), `src/tests/listings.test.ts` (novo).

**10. Testes executados:** Backend **61** (32 + grupo DEMO 21 + novo grupo Listagem **8**) + Fase 3 (OK) • Frontend 10/10 (OK) • `prisma validate`, `prisma generate`, `npm run build` (backend + frontend) OK.

**11. Migrations PostgreSQL (Prisma Migrate):**
- A pasta `backend/prisma/migrations` **não existia** antes (por isso o erro P2021 em produção).
- Migration inicial criada a partir do schema atual **sem tocar no banco de produção**: `backend/prisma/migrations/20260803000000_init/migration.sql` (gerada offline via `prisma migrate diff --from-empty --to-schema-datamodel`), acompanhada de `migration_lock.toml` (provider `postgresql`).
- Tabelas criadas (13): `organizations`, `users`, `marketplace_accounts`, `marketplace_listings`, `marketplace_variations`, `master_products`, `product_mappings`, `import_jobs`, `import_job_errors`, `sku_change_jobs`, `sku_change_job_items`, `inventory_items`, `audit_logs` + enums `Role`, `AccountStatus`, `SkuJobStatus`, `ImportJobStatus`, índices e chaves estrangeiras.
- Aplicação em produção: `npx prisma migrate deploy` no Build Command do Render (`npm install --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build`).
- **Seed DEMO**: `npm run seed:demo` (`prisma db seed`) e/ou boot do servidor (`ensureDemoData`) — ambos executam **somente com `ENABLE_DEMO_SEED=true`**, via upsert idempotente, criando a conta **`acc-shopee-demo`** para a organização **`org-festum-decor`**.
- **Tratamento P2021**: erros de tabela inexistente (P2021/P2024/P2010/P1001) retornam ao cliente a mensagem amigável *"O banco de dados ainda não foi inicializado. Aplique as migrations antes de continuar."* — sem vazar detalhes internos do banco (detalhes reais ficam nos logs do servidor).

---

## 🛠️ Arquitetura e Deploy

- **Frontend Netlify (Web App SaaS 24/7)**: [lxsync.netlify.app](https://lxsync.netlify.app/) — env var **`VITE_GOOGLE_CLIENT_ID`** (mesmo Client ID do backend) e `VITE_API_URL=https://lx-sync-api.onrender.com`.
- **Backend API Node.js / Express (Render)**: [lx-sync-api.onrender.com](https://lx-sync-api.onrender.com/) — REST API com CORS restrito por `FRONTEND_URL`, Prisma ORM e PostgreSQL.
  - Env vars obrigatórias: `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAILS`, `FRONTEND_URL` (+ `DATABASE_URL`).
  - **CORS**: `ALLOWED_ORIGINS` (separadas por vírgula, com `FRONTEND_URL` como fallback temporário) — atualmente `https://lx-syncmarketplace.lczinz.workers.dev,https://lxsync.netlify.app`. Comparação exata do header `Origin`, `credentials: true`, headers `Authorization`/`Content-Type`, OPTIONS/preflight habilitado; requisições sem `Origin` (healthchecks/servidor-servidor) permitidas.
  - Env opcional: `ENABLE_DEMO_SEED=true` (cria/atualiza a conta DEMO `acc-shopee-demo` da org `org-festum-decor` no boot do servidor, via upsert idempotente).
  - **Build Command (plano Free):**
    ```
    npm install --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build
    ```
    - `npm install --include=dev` instala também as devDependencies (o `prisma` CLI é devDependency e o `postinstall` já roda `prisma generate`).
    - `npx prisma migrate deploy` aplica as migrations versionadas de `backend/prisma/migrations/**` (histórico oficial — **não usa `prisma db push`**).
    - O seed DEMO roda automaticamente no boot do servidor (`ensureDemoData`) após as migrations, somente com `ENABLE_DEMO_SEED=true`; também disponível manualmente via `npm run seed:demo` (`prisma db seed`, idempotente via upsert).
  - Start Command: `npm start`.
- **Worker Assíncrono (`worker.ts`)**: Processador isolado da fila de SKUs.
- **Repositório GitHub**: [github.com/Lczinzx/lx-syncmarkteplace](https://github.com/Lczinzx/lx-syncmarkteplace)
