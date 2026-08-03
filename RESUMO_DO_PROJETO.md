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

### 6. 🔒 Autenticação Google OAuth JWT & Controle RBAC
- Integração nativa com a API REST de autenticação (`POST /api/auth/google` & `GET /api/auth/me`).
- Emissão e envio automático de cabeçalho `Authorization: Bearer <token>` em 100% das chamadas HTTP.
- **E-mails Administradores Autorizados**:
  - `lucasoliveiradossantos008@gmail.com`
  - `festumcontato@gmail.com`
- Bloqueio estrito de contas não autorizadas com mensagem amigável no cliente.

---

### 7. 🔔 Componente de Notificações Toast UI & Limpeza de Dados
- Substituição total de alertas nativos (`alert()`) por notificações visuais interativas (`showNotification()`) com cores por severidade (Verde, Vermelho, Amarelo, Azul).
- **Migrador Automático de Armazenamento (`APP_STORAGE_VERSION = 4`)**: Purga automática de dados mock legados nos navegadores dos usuários.

---

### 8. 📋 Logs de Auditoria & Exportação CSV
- Histórico transparente e persistido no banco de dados de todas as movimentações e operações de lote.
- Filtros por canal e status.
- Exportação em arquivo CSV.

---

## 🛠️ Arquitetura e Deploy

- **Frontend Netlify (Web App SaaS 24/7)**: [lxsync.netlify.app](https://lxsync.netlify.app/)
- **Backend API Node.js / Express**: REST API com suporte a CORS, Prisma ORM e PostgreSQL.
- **Worker Assíncrono (`worker.ts`)**: Processador isolado da fila de SKUs.
- **Repositório GitHub**: [github.com/Lczinzx/lx-syncmarkteplace](https://github.com/Lczinzx/lx-syncmarkteplace)
