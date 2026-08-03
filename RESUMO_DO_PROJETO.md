# 🚀 LX Sync Marketplace - Relatório Completo do Projeto

Este documento resume todas as funcionalidades, módulos, identidade visual e arquitetura desenvolvidos na plataforma **LX Sync Marketplace**.

---

## 🎨 Identidade Visual & Design System

- **Paleta de Cores**: Red Crimson Dark (#0A090B Fundo, #161316 Cards, #EF4444 Acento Principal, Gradiente Vermelho Carmesim).
- **Logotipo Principal**: Ícone vetorial da fachada de loja neon vermelha com efeito glow (`assets/logo.svg`).
- **Estilo de Interface**: Glassmorphism moderno com bordas translúcidas, sombras iluminadas e tipografia Inter.

---

## 🌟 Módulos e Funcionalidades Desenvolvidos

### 1. 🌐 Gestão de Múltiplas Contas por Plataforma
- Permite cadastrar e gerenciar **múltiplas contas/lojas simultâneas** em cada marketplace:
  - **Mercado Livre** (ex: *Loja Principal*, *Loja Outlet*)
  - **Shopee**
  - **TikTok Shop**
  - **Amazon BR**
- Cada conta possui Seller ID / Shop ID próprio, status de conexão ativo e chaves de API/Tokens.

---

### 2. 🚀 Publicador Multi-Post (Postagem Simultânea em Lote)
- Aba dedicada para cadastro único de produto (Título, SKU Master, Preço, Estoque Efetivo, Categoria, Imagem e Descrição).
- Checklist interativo para selecionar em quais contas publicar simultaneamente.
- Disparo paralelo com barra de progresso visual em tempo real por conta.
- Vinculação automática do novo produto ao estoque master centralizado.

---

### 3. 📦 Estoque Master & Mapeamento de SKUs (SyncEngine)
- Catálogo centralizado com tabela De-Para conectando os códigos de cada marketplace.
- Botões de ajuste rápido `+` e `-` com sincronização instantânea em todas as lojas conectadas.
- Regra de prevenção contra **overselling** (reserva de segurança / buffer de estoque).

---

### 4. 🔍 LX Marketplace Analyzer (Métricas & Análise de Concorrência)
- Simulação e estimativa de vendas e faturamento nos últimos 30 dias para qualquer produto ou categoria.
- Cálculo de comissões médias por marketplace.
- Sugestão automática de títulos campeões SEO otimizados para conversão.

---

### 5. 🔒 Autenticação Google SSO & Controle de Acesso Admin
- Tela de login com integração nativa **Google SSO**.
- **E-mails Administradores Autorizados**:
  - `lucasoliveiradossantos008@gmail.com`
  - `festumcontato@gmail.com`
- **Bloqueio de Acesso**: Qualquer conta de e-mail não autorizada é impedida de entrar com a mensagem de **ACESSO NEGADO**.
- Exibição do perfil do Admin (Avatar, Nome e E-mail) no topo e botão de **`🚪 Sair`** (Logout).

---

### 6. 📋 Logs de Auditoria & Exportação CSV
- Histórico transparente de todas as movimentações e sincronizações de estoque.
- Filtros por canal e por status (Sucesso, Alerta, Erro).
- Botão para exportação dos registros em arquivo CSV.

---

## 🛠️ Arquitetura e Deploy Automático (Continuous Deployment)

- **Repositório GitHub**: [github.com/Lczinzx/lx-syncmarkteplace](https://github.com/Lczinzx/lx-syncmarkteplace)
- **Hospedagem Web SaaS (24/7)**: [lxsync.netlify.app](https://lxsync.netlify.app/)
- **Deploy Automático**: Qualquer alteração enviada para o GitHub atualiza a versão pública na nuvem em menos de 10 segundos!
- **Suporte Duplo**: Funciona tanto como **Extensão para Google Chrome (Manifest V3)** quanto como **Web Application Standalone (Vite SPA)**.
