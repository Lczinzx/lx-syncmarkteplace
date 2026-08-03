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
- *(Status HTTP e quantidades reais de anúncios/variações importadas: pendente do teste público pós-deploy.)*

**7. Tratamento 404 no frontend:** remoção do card da conta, recarga da lista via `GET /api/marketplace-accounts`, aviso "Esta conta não existe mais. A lista de contas foi atualizada." e **nenhum reenvio automático** do POST.

**8. Publicador Multi-Post:** usa somente as contas vindas da API; IDs selecionados que não existem mais no backend bloqueiam a publicação com aviso e recarregam a lista.

**9. Arquivos alterados:**
- Frontend: `app.js`, `services/account-source.js` (novo), `services/storage.js`, `services/api/accounts-api.js`, `services/sync-engine.js`, `services/batch-publisher.js`, `tests/account-source.test.js` (novo), `package.json`.
- Backend: `src/server.ts`, `src/services/accounts.service.ts` (novo), `src/services/demo-seed.service.ts` (novo), `src/services/import.service.ts`, `package.json`, `.env.example`.

**10. Testes executados:** Backend 22 + Fase 3 (OK) • Frontend 10/10 (OK) • Builds `npm run build` (backend + frontend) OK.

---

## 🛠️ Arquitetura e Deploy

- **Frontend Netlify (Web App SaaS 24/7)**: [lxsync.netlify.app](https://lxsync.netlify.app/) — env var **`VITE_GOOGLE_CLIENT_ID`** (mesmo Client ID do backend) e `VITE_API_URL=https://lx-sync-api.onrender.com`.
- **Backend API Node.js / Express (Render)**: [lx-sync-api.onrender.com](https://lx-sync-api.onrender.com/) — REST API com CORS restrito por `FRONTEND_URL`, Prisma ORM e PostgreSQL.
  - Env vars obrigatórias: `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAILS`, `FRONTEND_URL`.
- **Worker Assíncrono (`worker.ts`)**: Processador isolado da fila de SKUs.
- **Repositório GitHub**: [github.com/Lczinzx/lx-syncmarkteplace](https://github.com/Lczinzx/lx-syncmarkteplace)
