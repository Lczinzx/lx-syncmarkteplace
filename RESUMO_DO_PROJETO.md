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
**1. Fontes de Dados e Contas DEMO:**
- **4 Contas DEMO Isoladas (`isDemo=true`)**:
  - `acc-shopee-demo` (Shopee): 50 anúncios, 129 variações.
  - `acc-mercadolivre-demo` (Mercado Livre): 1 anúncio (`FDM-ML-0001`), 1 variação.
  - `acc-tiktok-demo` (TikTok Shop): 1 anúncio (`FDM-TT-0001`), 1 variação.
  - `acc-amazon-demo` (Amazon BR): 1 anúncio (`FDM-AMZ-0001`), 1 variação.
- **Produto Mestre Central Multicanal**: `mp-Z_Red50_Zoologico_04` (SKU Central: `Z - Red50 - Zoologico - 04`) vinculando exatamente 4 anúncios (1 de cada conta de marketplace).
- **Contagem Global Persistida**: **53 anúncios e 132 variações** no total global das 4 contas. (Filtro exclusivo por Shopee exibe exatamente 50 anúncios / 129 variações).

**2. Suíte de Testes Automatizados (131 Testes Passing):**
- **Testes Backend**: 8 suítes / 114 cenários unitários e de integração (`demo-data` 21, `grouping-matching` 19, `listings` 8, `phase1-6-multichannel-coldstart` 6, `phase2-multichannel-edit` 15, `phase3-persistent-images` 10, `phase3-seller-center-ui` 4, `phase3` 31).
- **Testes Frontend**: 17 cenários unitários.
- **TOTAL DE TESTES AUTOMATIZADOS**: **131 testes com 100% de aprovação**.

**3. Resposta de `GET /api/marketplace-accounts` e `GET /api/marketplace-listings` (fonte única):**
- Lista real vinda do PostgreSQL via Prisma: `{ success: true, accounts: [...] }` e `{ success: true, listings: [...] }`.
- URLs públicas de deploy validadas:
  - Frontend Cloudflare Workers: `https://lx-syncmarketplace.lczinz.workers.dev`
  - Backend API Render: `https://lx-sync-api.onrender.com`

---

## 📋 Status Atual do Projeto

### ✅ **Completo (Backend + Core Frontend)**
- Autenticação Google OAuth + JWT + RBAC
- Múltiplas contas por marketplace (API única com 4 contas DEMO)
- Publicador Multi-Post (Drag & Drop + Progresso)
- Importação idempotente com FakeMarketplaceAdapter (53 anúncios / 132 variações)
- Importação idempotente + MatchingService + PreviewService
- Central de Anúncios Estilo Catálogo Seller Central (1 card = 1 anúncio) + Sub-abas + Modal Drawer de 5 abas internas
- Agrupamento Multicanal de Produtos + Sugestões de Vínculo com Confiança (%) + Exportação CSV Completa (`/api/marketplace-listings/export-csv`)
- Fila SKU assíncrona + Escopo padrão seguro `SINGLE_VARIATION` + Rollback/Desfazer
- Imagens Persistentes no PostgreSQL (`MarketplaceListingImage`), Migration Oficial (`20260805000000_phase3_images`), Serviço de Armazenamento Seguro (`ImageStorageService`), Validação Magic Bytes (JPG, PNG, WEBP até 5MB), Proteção SSRF em URLs externas e Cascata de Fallback Visual em 4 Níveis (`resolveCardImage`).
- **Testes Automatizados**: **131 passing** (114 backend + 17 frontend)
- CORS + P2021 handling + Health checks
- Deploy Render (Backend API) + Cloudflare Workers (Frontend Principal) + Netlify (Frontend Secundário) configurados

---

- **Frontend Cloudflare Workers (Principal 24/7)**: [lx-syncmarketplace.lczinz.workers.dev](https://lx-syncmarketplace.lczinz.workers.dev/)
- **Frontend Netlify (Alternativo/Ambiente Secundário)**: [lxsync.netlify.app](https://lxsync.netlify.app/).
- **Backend API Node.js / Express (Render)**: [lx-sync-api.onrender.com](https://lx-sync-api.onrender.com/)
- **Repositório GitHub**: [github.com/Lczinzx/lx-syncmarkteplace](https://github.com/Lczinzx/lx-syncmarkteplace)
