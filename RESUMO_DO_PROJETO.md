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

### 3. 🛒 Anúncios & SKUs (Estilo Central do Vendedor & Catálogo Responsivo)
- **Orientação Principal a ANÚNCIOS (`MarketplaceListing`)**:
  - A visualização inicial padrão da tela "Anúncios & SKUs" é a aba **"Todos os Anúncios"**, onde cada card representa **exatamente um `MarketplaceListing`** com foto grande em destaque estilo catálogo da Central do Vendedor (Shopee/Mercado Livre).
  - Motores de agrupamento multicanal (`MasterProduct`, `ProductMapping`, `MatchingService`) atuam de forma 100% transparente nos bastidores.
- **Grade Responsiva Estilo Catálogo de Produtos**:
  - Full HD Desktop: 4 cards por linha (`grid-template-columns: repeat(4, 1fr)`).
  - Notebook: 3 cards por linha.
  - Tablet: 2 cards por linha.
  - Mobile: 1 card por linha.
- **Cascata de Imagens em 4 Níveis (`resolveCardImage`)**:
  1. Imagem Principal do Anúncio (`listing.imageUrl` / `isPrimary=true`)
  2. Imagem do Produto Mestre vinculado
  3. Imagem da Variação
  4. Placeholder SVG Inline LX Sync base64
- **Abas da Página & Filtros em Tempo Real**:
  - Sub-abas: *Todos os Anúncios* (padrão), *Ativos*, *Pausados*, *Sem Estoque*, *Com Divergências*, *Não Vinculados* e *Produtos Vinculados* (aba secundária para `MasterProducts`).
  - Barra de filtros: Busca por título/SKU, seletor de marketplace, ordenação (Preço, Estoque, Título, Recentes) e barra flutuante de ações em lote.
- **Drawer / Modal de Gestão em 5 Abas Internas**:
  1. *Visão Geral*: Métricas, estoque total, faixa de preço e canais conectados.
  2. *Variações & SKUs*: Tabela completa de todas as variações sem omissões com foto, nome, SKU, preço, estoque, status e botão `[Editar SKU]`.
  3. *Imagens*: Galeria visual de fotos e marcação da imagem principal.
  4. *Canais Conectados*: Anúncios equivalentes nos 4 marketplaces com status, preço, estoque e nível de confiança.
  5. *Histórico*: AuditLog imutável de alterações com botão de rollback.
- **Edição de SKU Multicanal Segura**:
  - Escolha explícita do escopo com padrão seguro *"Somente esta variação"* (`SINGLE_VARIATION`) e prévia comparativa ANTES | DEPOIS.
- **Exportação CSV Completa no Backend**:
  - Endpoint `/api/marketplace-listings/export-csv` processa o catálogo completo de anúncios sem limitação de página no navegador.

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

### 9. 🧪 Suíte de Testes Automatizados (85 Testes Passing)
- **Backend (68 testes)**: 
  - 32 testes de validação de e-mails admin, criptografia AES-256-GCM, FakeMarketplaceAdapter, segurança Google OAuth (JWT) e tratamento de erros do Prisma (P2021).
  - 21 testes do conjunto DEMO (idempotência de importação, upsert de preços/estoques, estados variados e resiliência).
  - 8 testes de contrato de listagem de anúncios (`/api/marketplace-listings`).
  - 7 testes de Agrupamento Multicanal & Matching (`MatchingService`, decomposição Festum Decor e contrato de grupos).
  - 4 testes de transformação de SKUs, parser, chave SHA-256 e Rollback/Desfazer (Fase 3).
- **Frontend (17 testes)**: 
  - 10 testes de fonte única de contas via API, migração v5 e detecção 404.
  - 3 testes de interface da aba de Agrupamento Multicanal, cards de vínculo pendente e estrutura da exportação CSV.
  - 4 testes de layout dos cards de anúncio, resiliência do placeholder SVG inline, badge counter do menu lateral e limites responsivos de colunas.

---

### 10. 🔗 Agrupamento Multicanal de Produtos (`ProductGroupsService` & `MatchingService`)
- **Motor de Agrupamento por Produto Mestre**:
  - Consolida anúncios e variações de múltiplos marketplaces (Shopee, Mercado Livre, TikTok Shop, Amazon BR) em Produtos Mestres unificados.
  - Decomposição automática da estrutura de SKU Festum Decor (`Prefixo - Medida/Tipo - Tema - Código`) para identificação precisa do produto.
- **Cálculo de Score de Confiança (%)**:
  - **Confiança Muito Forte (≥90%)**: SKUs idênticos em canais diferentes.
  - **Sugestão de Revisão (70%-89%)**: Títulos ou códigos compatíveis com pequenas variações.
  - **Penalização por Divergência Crítica**: Conflitos de medida (ex: `Red50` vs `Red80`) reduzem a confiança para no máximo 50%.
- **Subabas da Interface ("Produtos Agrupados" / "Vínculos Pendentes")**:
  - Visualização gráfica dos grupos formados com indicação visual de divergências de preço, estoque e SKU.
  - Painel de **Sugestões de Agrupamento** com indicação da porcentagem de confiança e botões para **Confirmar** ou **Rejeitar** o vínculo instantaneamente.
  - Listagem de **Anúncios Não Vinculados**.
- **Exportação CSV**:
  - Geração de relatório CSV formatado contendo o SKU Mestre, Nome, Estoque Total, Variações e o detalhamento de cada anúncio vinculado por marketplace.

---

### 11. 📋 Relatório Final — Correção da Fonte de Contas (API como Única Fonte)

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

**10b. Estado Atual — Visual Overhaul (Fase 1) & Agrupamento Multicanal (100% Concluídos):**
- **Frontend**: 
  - Cards de anúncios Glassmorphism em grid responsivo (`auto-fill minmax(380px, 1fr)`) com limite de 2-3 colunas em desktop e 1 coluna em mobile.
  - Variações expansíveis/recolhíveis com tabela detalhada e visualização adaptativa para telas pequenas.
  - Subaba de **Produtos Agrupados** e **Vínculos Pendentes / Sugestões** integrada com score de confiança (%) e exportação CSV.
  - Cards de Resumo no topo exibindo 7 métricas em tempo real (Anúncios Totais, Variações, Ativos, Pausados, Zerados, Estoque Baixo, Sem SKU).
  - Badge lateral do menu sincronizado com o total real de anúncios e variações importadas.
  - Placeholder SVG Inline base64 com logo LX Sync para garantir resiliência visual contra imagens quebradas.
- **Backend**:
  - Endpoint `GET /api/marketplace-listings` (Bearer JWT) fornecendo 50 anúncios / 129 variações com `imageUrl` nas variações.
  - Endpoints `/api/product-groups` e `/api/product-groups/suggestions` gerenciando a busca, vínculo e score de divergências entre canais.
  - Suporte completo a CORS (`ALLOWED_ORIGINS` permitindo Cloudflare Workers + Netlify) e tratamento de migrations do Prisma (P2021).

**11. Migrations PostgreSQL (Prisma Migrate):**
- Pasta `backend/prisma/migrations` versionada com a migration inicial `20260803000000_init`.
- 13 tabelas estruturadas + enums e índices aplicados via `npx prisma migrate deploy` no Render.
- Seed idempotente (`ENABLE_DEMO_SEED=true`) alimentando a organização `org-festum-decor` com 50 anúncios e 129 variações Festum Decor.

---

## 📋 Status Atual do Projeto

### ✅ **Completo (Backend + Core Frontend)**
- Autenticação Google OAuth + JWT + RBAC
- Múltiplas contas por marketplace (API única)
- Publicador Multi-Post (Drag & Drop + Progresso)
- Importação idempotente com FakeMarketplaceAdapter (50 anúncios / 129 variações)
- Importação idempotente + MatchingService + PreviewService
- Agrupamento Multicanal de Produtos + Sugestões de Vínculo com Confiança (%) + Exportação CSV
- Fila SKU assíncrona + Rollback/Desfazer
- Visual Overhaul (Fase 1): Cards Glassmorphism, Grid Responsivo, Badges Neon, Indicadores de Estoque
- Logs Auditoria + Export CSV
- **Fase 3 Concluída**: Modelo de dados normalizado (`MarketplaceListingImage`), Migration oficial do Prisma (`20260805000000_phase3_images`), Serviço de Armazenamento Seguro (`ImageStorageService`), Validação Magic Bytes (JPG, PNG, WEBP até 5MB), Proteção SSRF em URLs externas, Cascata de Fallback Visual em 4 Níveis (`getImageFallbackUrl`), Importação Idempotente de Mídias, Endpoints REST de Galeria/Upload, Reordenação, Imagem Principal Única e mídias por variação.
- **Testes Automatizados**: **127 passing** (110 backend com 19 cenários de agrupamento + 15 cenários da Fase 2 + 10 cenários da Fase 3 + 6 cenários da Fase 1.6 + 17 frontend)
- CORS + P2021 handling + Health checks
- Deploy Render (Backend API) + Cloudflare Workers (Frontend Principal) + Netlify (Frontend Secundário) configurados

### 📋 **Próximas Fases (Planejadas)**
| Fase | Entregável | Status |
|------|------------|--------|
| **Fase 1** | Cards visuais completos + CSS + Grid Responsivo + Placeholders | ✅ **Concluído** |
| **Fase Multicanal & Escopo** | Conexão Multicanal (14 Pontos), Agrupamento por Produto Mestre, Sugestões (70-89%), Auto-Link (≥90%), 6 Escopos de Edição, Validação por Canal, Fusão/Divisão, Rematching & 19 Cenários de Testes | ✅ **Concluído** |
| **Fase 1.6** | Validação Pública Multicanal (4 Contas DEMO: Shopee, Mercado Livre, TikTok, Amazon BR), Grupo Mestre 4-Marketplaces, Diagnóstico 52/133, Boot Não-Bloqueante (< 2s), Cold Start Warning, Deduplicação In-Flight e Lazy Loading | ✅ **Concluído** |
| **Fase 2** | Edição Multicanal (6 Etapas & 6 Escopos), Prévia Comparativa Antes/Depois (`PreviewService` + `MarketplaceRulesService`), Edição de SKU, Fila Assíncrona com Controles (`pause`, `resume`, `cancel`, `retry-failed`), Confirmação Remota pelo Adapter, Modal de Anúncio Individual (4 Abas), AuditLog Imutável e Rollback Auditável | ✅ **Concluído** |
| **Fase 3** | Imagens Persistentes no PostgreSQL (`MarketplaceListingImage`), Migration Oficial, Storage Provider com Magic Bytes & Proteção SSRF, Endpoints REST de Galeria/Upload/Reordenação/Principal, Fallback Visual em 4 Níveis e Mídias DEMO | ✅ **Concluído** |

---

- **Frontend Cloudflare Workers (Principal 24/7)**: [lx-syncmarketplace.lczinz.workers.dev](https://lx-syncmarketplace.lczinz.workers.dev/) — env var `VITE_API_URL=https://lx-sync-api.onrender.com`.
- **Frontend Netlify (Alternativo/Ambiente Secundário)**: [lxsync.netlify.app](https://lxsync.netlify.app/).
- **Backend API Node.js / Express (Render)**: [lx-sync-api.onrender.com](https://lx-sync-api.onrender.com/) — REST API com CORS restrito por `FRONTEND_URL`, Prisma ORM e PostgreSQL.
  - Env vars obrigatórias: `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAILS`, `FRONTEND_URL` (+ `DATABASE_URL`).
  - **CORS**: `ALLOWED_ORIGINS` — `https://lx-syncmarketplace.lczinz.workers.dev,https://lxsync.netlify.app`.
  - Env opcional: `ENABLE_DEMO_SEED=true` (cria/atualiza as 4 contas DEMO e o Produto Mestre 4-Marketplaces `mp-Z_Red50_Zoologico_04` no boot do servidor via upsert idempotente).
  - **Build Command (plano Free):**
    ```
    npm install --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build
    ```
  - Start Command: `npm start`.
- **Worker Assíncrono (`worker.ts`)**: Processador isolado da fila de SKUs.
- **Repositório GitHub**: [github.com/Lczinzx/lx-syncmarkteplace](https://github.com/Lczinzx/lx-syncmarkteplace)
