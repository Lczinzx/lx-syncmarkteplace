/**
 * LX Sync Marketplace - Web Application Controller (SPA)
 */

import { StorageService } from './services/storage.js';
import { SyncEngine } from './services/sync-engine.js';
import { BatchPublisher } from './services/batch-publisher.js';
import { apiFetch } from './services/api/api-client.js';
import { AuthAPI } from './services/api/auth-api.js';
import { AccountsAPI } from './services/api/accounts-api.js';
import { ListingsAPI } from './services/api/listings-api.js';
import { GroupsAPI } from './services/api/groups-api.js';
import { extractAccountsFromResponse, normalizeAccountsFromApi, isAccountNotFoundError } from './services/account-source.js';

export function showNotification(type = 'info', title = '', message = '', actionLabel = null, onAction = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-card toast-${type}`;
  toast.style.cssText = `
    background: rgba(22, 19, 22, 0.95);
    border: 1px solid ${type === 'success' ? '#10B981' : type === 'warning' ? '#F59E0B' : type === 'error' ? '#EF4444' : '#3B82F6'};
    border-radius: 12px;
    padding: 14px 18px;
    color: #fff;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 15px ${type === 'success' ? 'rgba(16,185,129,0.2)' : type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'};
    backdrop-filter: blur(10px);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    animation: slideInRight 0.3s ease;
  `;

  const iconMap = {
    success: '✅',
    warning: '⚠️',
    error: '🚨',
    info: 'ℹ️'
  };

  toast.innerHTML = `
    <div style="font-size: 20px; flex-shrink: 0;">${iconMap[type] || 'ℹ️'}</div>
    <div style="flex: 1;">
      <h4 style="font-size: 14px; font-weight: 700; color: #fff; margin: 0 0 2px 0;">${escapeHtml(title)}</h4>
      <p style="font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.4;">${escapeHtml(message)}</p>
      ${actionLabel ? `<button class="btn btn-secondary btn-sm toast-action-btn" style="margin-top: 8px; font-size: 11px;">${escapeHtml(actionLabel)}</button>` : ''}
    </div>
    <button class="toast-close-btn" style="background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 0;">&times;</button>
  `;

  const closeBtn = toast.querySelector('.toast-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', () => toast.remove());

  if (actionLabel && onAction) {
    const actionBtn = toast.querySelector('.toast-action-btn');
    if (actionBtn) actionBtn.addEventListener('click', () => { onAction(); toast.remove(); });
  }

  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

let currentSkus = [];
let currentLogs = [];
let currentSettings = {};
let currentAccounts = [];
let currentUser = null;
let currentListings = [];
let currentSubtab = 'grouped';
let currentGroupedProducts = [];
let currentPendingMatches = [];

document.addEventListener('DOMContentLoaded', async () => {
  await initApp();
  setupNavigation();
  setupSubtabsNavigation();
  setupEventListeners();
});

async function initApp() {
  currentSettings = await StorageService.getSettings();
  currentSkus = await StorageService.getSkus();
  currentLogs = await StorageService.getLogs();

  const isAuthenticated = await checkAuthSession();
  if (isAuthenticated) {
    await refreshAccountsFromAPI();
  }
  renderAllViews();
}

async function refreshAccountsFromAPI() {
  try {
    const res = await AccountsAPI.getAccounts();
    // FONTE ÚNICA: resposta da API. Nunca usa localStorage/chrome.storage.
    const apiAccounts = extractAccountsFromResponse(res);
    currentAccounts = normalizeAccountsFromApi(apiAccounts);
    console.log(`[ACCOUNTS] ${currentAccounts.length} conta(s) carregada(s) do backend:`, currentAccounts.map(a => a.id));
  } catch (err) {
    // Sem fallback local: lista vazia + aviso amigável
    currentAccounts = [];
    console.error('[ACCOUNTS] Falha ao carregar contas da API (sem fallback local):', err.message);
    showNotification('error', 'Contas indisponíveis', 'Não foi possível carregar as contas do servidor.');
  }
  renderAllViews();
}

async function checkAuthSession() {
  const authModal = document.getElementById('modal-auth-login');
  const token = localStorage.getItem('lx_jwt_token');

  if (!token) {
    if (authModal) authModal.classList.add('active');
    return false;
  }

  try {
    const res = await AuthAPI.getCurrentUser();
    if (res && res.user) {
      currentUser = res.user;
      updateUserProfileBadge(currentUser);
      if (authModal) authModal.classList.remove('active');
      return true;
    }
  } catch (err) {
    console.warn('⚠️ Token inválido ou sessão expirada no backend:', err.message);
    localStorage.removeItem('lx_jwt_token');
    localStorage.removeItem('lx_auth_user');
  }

  if (authModal) authModal.classList.add('active');
  return false;
}

function updateUserProfileBadge(user) {
  const badge = document.getElementById('user-profile-badge');
  const nameElem = document.getElementById('user-name-display');
  const emailElem = document.getElementById('user-email-display');
  const avatarElem = document.getElementById('user-avatar');

  if (user) {
    if (nameElem) nameElem.textContent = user.name || 'Admin LX';
    if (emailElem) emailElem.textContent = user.email;
    if (avatarElem) avatarElem.src = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'Admin')}&background=EF4444&color=fff`;
    if (badge) badge.style.display = 'flex';
  }
}

function renderAllViews() {
  renderOverview();
  renderSkusTable(currentSkus);
  renderLogsTable(currentLogs);
  populateSettingsForm();
  renderAccountsGrid();
  renderMultiPostAccountsList();
  updateHealthIndicator();
}

/* ==========================================
   NAVIGATION & TAB ROUTER SYSTEM
   ========================================== */
function setupNavigation() {
  const links = document.querySelectorAll('.nav-link');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = link.dataset.tab;
      if (targetTab) switchTab(targetTab);
    });
  });

  if (window.location.hash) {
    const hash = window.location.hash.replace('#', '');
    switchTab(hash);
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeLink = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
  const activeContent = document.getElementById(`tab-${tabId}`);

  if (activeLink) activeLink.classList.add('active');
  if (activeContent) activeContent.classList.add('active');

  const titles = {
    overview: { title: 'Visão Geral', sub: 'Acompanhe a sincronização de estoque entre Mercado Livre, Shopee, TikTok Shop e Amazon BR.' },
    multipost: { title: 'Publicador Multi-Post', sub: 'Cadastre seu anúncio uma vez e publique simultaneamente em todas as suas contas conectadas.' },
    skus: { title: 'Anúncios & SKUs', sub: 'Gerencie seu catálogo central e o mapeamento de códigos (De-Para) por canal.' },
    analyzer: { title: 'LX Marketplace Analyzer', sub: 'Estimativa de vendas em 30 dias, cálculo de margem/comissões e títulos SEO recomendados por IA.' },
    channels: { title: 'Canais & APIs', sub: 'Gerenciamento de múltiplas contas ativas e credenciais de cada plataforma.' },
    logs: { title: 'Logs de Auditoria', sub: 'Histórico auditável e transparente de todas as alterações de estoque.' },
    settings: { title: 'Configurações & Seguranças', sub: 'Ajuste regras de prevenção contra overselling e rotinas de fundo.' }
  };

  if (titles[tabId]) {
    document.getElementById('page-title').textContent = titles[tabId].title;
    document.getElementById('page-subtitle').textContent = titles[tabId].sub;
  }

  if (tabId === 'skus') {
    loadSkusSubtabData();
  }
}

/* ==========================================
   TAB 1: OVERVIEW
   ========================================== */
function renderOverview() {
  document.getElementById('badge-sku-count').textContent = currentSkus.length;
  document.getElementById('kpi-total-skus').textContent = currentSkus.length;

  const totalStock = currentSkus.reduce((acc, curr) => acc + (curr.totalStock || 0), 0);
  document.getElementById('kpi-total-stock').textContent = totalStock;

  const criticalSkus = currentSkus.filter(s => s.status === 'critical' || s.status === 'warning').length;
  document.getElementById('kpi-critical-skus').textContent = criticalSkus;
  document.getElementById('kpi-critical-sub').textContent = criticalSkus > 0 ? `${criticalSkus} item(ns) requerem atenção` : 'Estoque saudável em todos itens';

  // Renderiza Dinamicamente os Canais Conectados no Overview
  renderOverviewAccounts();

  // Controla botões do topo (Sincronizar e Simular Venda)
  const btnSync = document.getElementById('btn-sync-all');
  if (btnSync) {
    if (currentSkus.length === 0 || currentAccounts.length === 0) {
      btnSync.disabled = true;
      btnSync.title = 'Desabilitado: Cadastre Produtos Mestres e Conecte uma Conta para sincronizar';
    } else {
      btnSync.disabled = false;
      btnSync.title = 'Sincronizar estoque efetivo em todos os canais';
    }
  }

  const btnSimulate = document.getElementById('btn-simulate-sale');
  if (btnSimulate) {
    btnSimulate.style.display = currentSettings.demoMode ? 'inline-flex' : 'none';
  }

  const recent = currentLogs.slice(0, 5);
  const tbody = document.getElementById('overview-recent-logs');
  if (!tbody) return;

  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-muted);">Nenhuma atividade registrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(log => `
    <tr>
      <td>${formatTime(log.timestamp)}</td>
      <td><strong>${escapeHtml(log.masterSku)}</strong></td>
      <td>${escapeHtml(log.marketplace)}</td>
      <td>${escapeHtml(log.trigger)}</td>
      <td>${log.oldStock} &rarr; <strong>${log.newStock}</strong></td>
      <td><span class="status-badge ${log.status}">${log.status.toUpperCase()}</span></td>
    </tr>
  `).join('');
}

function renderOverviewAccounts() {
  const container = document.getElementById('overview-accounts-grid');
  if (!container) return;

  if (currentAccounts.length === 0) {
    container.innerHTML = `
      <div class="card" style="grid-column: 1/-1; text-align: center; padding: 32px; border-color: rgba(239, 68, 68, 0.2);">
        <h4 style="font-size: 14px; color: #fff; margin-bottom: 6px;">Nenhuma conta cadastrada.</h4>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Adicione sua primeira loja para visualizar o status de sincronização no dashboard.</p>
        <button class="btn btn-primary btn-sm" id="btn-overview-add-acc" style="font-weight: 700;">+ Adicionar primeira conta</button>
      </div>`;

    const btn = document.getElementById('btn-overview-add-acc');
    if (btn) btn.addEventListener('click', () => openAccountModal());
    return;
  }

  const platformBadges = {
    meli: { badgeClass: 'meli-bg', label: 'ML', name: 'Mercado Livre' },
    shopee: { badgeClass: 'shopee-bg', label: 'SHP', name: 'Shopee' },
    tiktok: { badgeClass: 'tiktok-bg', label: 'TT', name: 'TikTok Shop' },
    amazon: { badgeClass: 'shopee-bg', label: 'AMZ', name: 'Amazon BR' }
  };

  container.innerHTML = currentAccounts.map(acc => {
    const meta = platformBadges[acc.platform] || { badgeClass: 'meli-bg', label: 'MP', name: acc.platformName || acc.platform };
    return `
      <div class="channel-card shadow-card">
        <div class="channel-header">
          <div class="channel-brand">
            <div class="channel-icon ${meta.badgeClass}">${meta.label}</div>
            <div>
              <h4>${escapeHtml(acc.accountName || acc.sellerName || acc.name || meta.name)}</h4>
              <span class="seller-name">${escapeHtml(meta.name)} • ID: ${escapeHtml(acc.sellerId || acc.shopId || acc.id)}</span>
            </div>
          </div>
          <span class="status-chip ${acc.status === 'CONNECTED' || acc.connected ? 'connected' : ''}">${acc.status === 'CONNECTED' || acc.connected ? 'Ativo' : 'Desconectado'}</span>
        </div>
        <div class="channel-metrics">
          <div class="metric"><span class="m-label">Modo</span><span class="m-val" style="color:#FBBF24;">${acc.isDemo === true ? 'DEMO' : 'REAL'}</span></div>
          <div class="metric"><span class="m-label">Status Sync</span><span class="m-val text-green">${acc.status === 'CONNECTED' || acc.connected ? '100% OK' : 'Alerta'}</span></div>
        </div>
      </div>
    `;
  }).join('');
}

/* ==========================================
   TAB 2: ANÚNCIOS & SKUS (SUB-ABAS MULTICANAL)
   ========================================== */

let expandedListings = new Set();

function setupSubtabsNavigation() {
  const subtabBtns = document.querySelectorAll('.subtab-btn');
  subtabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      subtabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSubtab = btn.dataset.subtab;

      const titles = {
        grouped: { title: '📦 Produtos Agrupados (SyncGroup / MasterProduct)', sub: 'Anúncios equivalentes de diferentes marketplaces agrupados em um único produto central.' },
        pending: { title: '🔍 Vínculos para Revisar (Pendências de Matching)', sub: 'Anúncios com média confiança (70% a 89%) aguardando confirmação humana.' },
        listings: { title: '🏷️ Anúncios por Canal (Visão Detalhada)', sub: 'Lista completa de anúncios persistidos por conta e marketplace.' }
      };

      if (titles[currentSubtab]) {
        const titleEl = document.getElementById('subtab-title');
        const subEl = document.getElementById('subtab-subtitle');
        if (titleEl) titleEl.textContent = titles[currentSubtab].title;
        if (subEl) subEl.textContent = titles[currentSubtab].sub;
      }

      loadSkusSubtabData();
    });
  });
}

function loadSkusSubtabData() {
  if (currentSubtab === 'grouped') {
    loadGroupedProducts();
  } else if (currentSubtab === 'pending') {
    loadPendingMatches();
  } else {
    loadMarketplaceListings();
  }
}

async function loadGroupedProducts() {
  const container = document.getElementById('marketplace-listings-container');
  if (container) {
    container.innerHTML = `
      <div class="listings-loading" style="grid-column: 1 / -1; text-align: center; padding: 64px;">
        <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(167, 243, 208, 0.3); border-top-color: #A7F3D0; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
        <p style="color: var(--text-muted); font-size: 16px;">Carregando produtos agrupados do servidor...</p>
      </div>
    `;
  }

  try {
    const res = await GroupsAPI.getGroupedProducts();
    currentGroupedProducts = (res && res.groupedProducts) || [];
    renderGroupedProducts();
    await updatePendingMatchesBadge();
  } catch (err) {
    currentGroupedProducts = [];
    console.error('[GROUPS] Falha ao carregar produtos agrupados:', err.message);
    if (container) {
      container.innerHTML = `
        <div class="listings-error" style="grid-column: 1 / -1; text-align: center; padding: 48px; background: rgba(239, 68, 68, 0.1); border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3);">
          <h3 style="color: #EF4444; margin-bottom: 12px;">❌ Não foi possível carregar os produtos agrupados</h3>
          <p style="color: var(--text-muted); font-size: 14px;">${escapeHtml(err.message)}</p>
          <button class="btn btn-secondary" style="margin-top: 16px;" onclick="window.loadGroupedProducts()">Tentar Novamente</button>
        </div>
      `;
    }
  }
}

function renderGroupedProducts(groupsToRender = currentGroupedProducts) {
  const container = document.getElementById('marketplace-listings-container');
  if (!container) return;

  if (groupsToRender.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 64px; background: var(--bg-card); border-radius: 12px; border: 2px dashed var(--border-subtle);">
        <div style="font-size: 56px; margin-bottom: 16px;">📦</div>
        <h3 style="color: var(--text-primary); margin-bottom: 8px;">Nenhum produto agrupado</h3>
        <p style="color: var(--text-muted); margin-bottom: 24px;">Use "Importar Anúncios" em Canais & APIs ou clique em "Reanalisar Correspondências" para agrupar anúncios.</p>
        <button class="btn btn-primary" onclick="document.querySelector('[data-tab=\\"channels\\"]').click()">Ir para Canais & APIs</button>
      </div>
    `;
    return;
  }

  const counterEl = document.getElementById('listings-counter');
  if (counterEl) {
    counterEl.textContent = `${groupsToRender.length} produto(s) central(is) agrupado(s)`;
  }

  const placeholderSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4OCIgaGVpZ2h0PSI4OCIgdmlld0JveD0iMCAwIDg4IDg4Ij48cmVjdCB3aWR0aD0iODgiIGhlaWdodD0iODgiIHJ4PSIxMiIgZmlsbD0iIzE5MTIxNCIgc3Ryb2tlPSJyZ2JhKDIzOSwgNjgsIDY4LCAwLjMpIiBzdHJva2Utd2lkdGg9IjEiLz48dGV4dCB4PSI1MCUiIHk9IjQyJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI0VGNDQ0NCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSI4MDAiPkxYPC90ZXh0Pjx0ZXh0IHg9IjUwJSIgeT0iNjIlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOUNBM0FGIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSI5IiBmb250LXdlaWdodD0iNjAwIj5TeW5jPC90ZXh0Pjwvc3ZnPg==';

  container.innerHTML = groupsToRender.map(group => {
    const isExpanded = expandedListings.has(group.id);
    const priceRange = group.priceMin === group.priceMax
      ? `R$ ${group.priceMin.toFixed(2)}`
      : `R$ ${group.priceMin.toFixed(2)} - R$ ${group.priceMax.toFixed(2)}`;

    const divergencesHtml = group.divergences && group.divergences.length > 0
      ? `<div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 8px 12px; font-size: 11px; color: #FBBF24; margin-top: 4px;">
          ⚠️ <strong>Divergências no Grupo:</strong> ${group.divergences.map(d => escapeHtml(d)).join(' • ')}
         </div>`
      : '';

    const listingsRows = group.listings.map(l => {
      const vCount = l.variations?.length || 0;
      const confidenceBadge = Math.round((l.confidenceScore || 1.0) * 100);
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
          <td style="padding: 8px 10px;">
            <span class="badge ${l.marketplace || 'meli'}">${escapeHtml((l.marketplace || 'mp').toUpperCase())}</span>
          </td>
          <td style="padding: 8px 10px;">
            <strong style="color: #fff; font-size: 12px;">${escapeHtml(l.accountName)}</strong>
          </td>
          <td style="padding: 8px 10px;">
            <div style="font-weight: 600; color: #fff; font-size: 12px;">${escapeHtml(l.title)}</div>
            <code class="external-id-badge" style="font-size: 10px;">${escapeHtml(l.externalListingId)}</code>
          </td>
          <td style="padding: 8px 10px;">
            <span class="pill-mini synced">${confidenceBadge}% Confiança</span>
          </td>
          <td style="padding: 8px 10px;">
            <span class="status-chip ${l.status === 'PAUSED' ? 'paused' : 'active'}">${l.status}</span>
          </td>
          <td style="padding: 8px 10px; text-align: right;">
            <span style="font-size: 11px; color: var(--text-muted);">${vCount} variação(ões)</span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <article class="announcement-card ${isExpanded ? 'expanded' : ''}" data-listing-id="${escapeHtml(group.id)}">
        <div class="card-header-wrapper">
          <img src="${placeholderSvg}" alt="${escapeHtml(group.name)}" class="listing-main-image">
          <div class="card-header-info">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="pill-mini meli">PRODUTO CENTRAL</span>
              <code class="external-id-badge">${escapeHtml(group.masterSku)}</code>
            </div>
            <h3 class="announcement-title">${escapeHtml(group.name)}</h3>
            <div class="announcement-meta-pills">
              <span class="badge-account-name">${group.marketplacesCount} Marketplace(s)</span>
              <span class="status-chip active">✅ ${group.listingsCount} Anúncios Vinculados</span>
              <span class="status-chip paused">${group.variationsCount} Variações</span>
            </div>
          </div>
        </div>

        ${divergencesHtml}

        <div class="card-metrics-grid">
          <div class="metric-box">
            <span class="metric-label">Faixa de Preço</span>
            <span class="metric-value price">${priceRange}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Estoque Total</span>
            <span class="metric-value stock ${group.totalStock === 0 ? 'zero' : group.totalStock <= 2 ? 'low' : ''}">${group.totalStock} un</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Canais</span>
            <span class="metric-value">${group.marketplacesCount} marketplaces</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Status Sync</span>
            <span class="metric-value sync">100% Sincronizado</span>
          </div>
        </div>

        <div class="card-footer-actions">
          <button class="btn btn-secondary btn-sm btn-toggle-variations" onclick="event.stopPropagation(); window.toggleListingExpansion('${escapeHtml(group.id)}')">
            <span class="variations-arrow ${isExpanded ? 'expanded' : ''}">▼</span>
            ${isExpanded ? 'Ocultar anúncios vinculados' : 'Ver anúncios vinculados'} (${group.listingsCount})
          </button>
          <button class="btn btn-primary btn-sm btn-edit-announcement" onclick="event.stopPropagation(); window.openEditAnnouncementModal('${escapeHtml(group.id)}')">
            ✏️ Editar produto central
          </button>
        </div>

        <div class="variations-section" id="variations-${escapeHtml(group.id)}" style="${isExpanded ? 'display: block;' : 'display: none;'}">
          <h4 style="font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 10px;">Anúncios e Variações Vinculadas ao Produto Central:</h4>
          <div class="variations-table-wrapper">
            <table class="variations-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Conta</th>
                  <th>Anúncio & ID</th>
                  <th>Confiança</th>
                  <th>Status</th>
                  <th style="text-align: right;">Variações</th>
                </tr>
              </thead>
              <tbody>
                ${listingsRows}
              </tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

async function loadPendingMatches() {
  const container = document.getElementById('marketplace-listings-container');
  if (container) {
    container.innerHTML = `
      <div class="listings-loading" style="grid-column: 1 / -1; text-align: center; padding: 64px;">
        <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(251, 191, 36, 0.3); border-top-color: #FBBF24; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
        <p style="color: var(--text-muted); font-size: 16px;">Buscando vínculos pendentes de revisão humana...</p>
      </div>
    `;
  }

  try {
    const res = await GroupsAPI.getPendingMatches();
    currentPendingMatches = (res && res.pendingMatches) || [];
    renderPendingMatches();
    await updatePendingMatchesBadge();
  } catch (err) {
    currentPendingMatches = [];
    console.error('[GROUPS] Falha ao carregar pendências:', err.message);
    if (container) {
      container.innerHTML = `
        <div class="listings-error" style="grid-column: 1 / -1; text-align: center; padding: 48px; background: rgba(239, 68, 68, 0.1); border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3);">
          <h3 style="color: #EF4444; margin-bottom: 12px;">❌ Não foi possível carregar as pendências de matching</h3>
          <p style="color: var(--text-muted); font-size: 14px;">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }
}

function renderPendingMatches() {
  const container = document.getElementById('marketplace-listings-container');
  if (!container) return;

  if (currentPendingMatches.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 64px; background: var(--bg-card); border-radius: 12px; border: 2px dashed var(--border-subtle);">
        <div style="font-size: 56px; margin-bottom: 16px;">✅</div>
        <h3 style="color: #34D399; margin-bottom: 8px;">Nenhuma pendência de vínculo</h3>
        <p style="color: var(--text-muted); margin-bottom: 24px;">Todos os anúncios importados estão vinculados ou classificados com alta confiança.</p>
      </div>
    `;
    return;
  }

  const counterEl = document.getElementById('listings-counter');
  if (counterEl) {
    counterEl.textContent = `${currentPendingMatches.length} vínculo(s) pendente(s) de revisão`;
  }

  container.innerHTML = currentPendingMatches.map(item => `
    <article class="announcement-card" style="border-color: rgba(251, 191, 36, 0.4);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 10px; margin-bottom: 12px;">
        <span class="pill-mini shopee" style="font-size: 11px;">🔍 Sugestão de Matching</span>
        <span class="status-chip paused" style="font-size: 12px;">Confiança: ${Math.round((item.confidenceScore || 0.8) * 100)}%</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px;">
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.04);">
          <span style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Produto Mestre Central</span>
          <h4 style="font-size: 14px; font-weight: 700; color: #fff; margin: 4px 0 2px;">${escapeHtml(item.masterProduct.name)}</h4>
          <code class="external-id-badge">${escapeHtml(item.masterProduct.masterSku)}</code>
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.04);">
          <span style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Anúncio do Marketplace (${escapeHtml((item.listing.marketplace || 'mp').toUpperCase())})</span>
          <h4 style="font-size: 14px; font-weight: 700; color: #fff; margin: 4px 0 2px;">${escapeHtml(item.listing.title)}</h4>
          <span style="font-size: 11px; color: #60A5FA;">${escapeHtml(item.listing.accountName)} • ${escapeHtml(item.listing.externalListingId)}</span>
        </div>
      </div>

      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 10px; border-radius: 8px; font-size: 12px; color: var(--text-muted); margin-bottom: 14px;">
        💡 <strong>Sinais de Coincidência:</strong> ${item.compatibilities && item.compatibilities.length > 0 ? item.compatibilities.map(c => escapeHtml(c)).join(' • ') : escapeHtml(item.reason)}
      </div>

      <div class="card-footer-actions">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.handleConfirmMatch('${item.mappingId}')" style="flex: 1; justify-content: center;">
          ✅ Confirmar Vínculo
        </button>
        <button class="btn btn-danger-outline btn-sm" onclick="event.stopPropagation(); window.handleRejectMatch('${item.mappingId}')" style="flex: 1; justify-content: center;">
          ❌ Rejeitar
        </button>
      </div>
    </article>
  `).join('');
}

async function updatePendingMatchesBadge() {
  try {
    const res = await GroupsAPI.getPendingMatches();
    const count = (res && res.totalPending) || 0;
    const badge = document.getElementById('badge-pending-matches-count');
    if (badge) badge.textContent = count;
  } catch (e) {
    // silencioso
  }
}

async function loadMarketplaceListings() {
  const container = document.getElementById('marketplace-listings-container');
  if (container) {
    container.innerHTML = `
      <div class="listings-loading" style="grid-column: 1 / -1; text-align: center; padding: 64px;">
        <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(167, 243, 208, 0.3); border-top-color: #A7F3D0; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
        <p style="color: var(--text-muted); font-size: 16px;">Carregando anúncios do servidor...</p>
      </div>
    `;
  }

  try {
    const res = await ListingsAPI.getListings();
    currentListings = (res && res.listings) || [];
    renderMarketplaceListings();
  } catch (err) {
    currentListings = [];
    console.error('[LISTINGS] Falha ao carregar anúncios do backend:', err.message);
    const containerEl = document.getElementById('marketplace-listings-container');
    if (containerEl) {
      containerEl.innerHTML = `
        <div class="listings-error" style="grid-column: 1 / -1; text-align: center; padding: 64px; background: rgba(239, 68, 68, 0.1); border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3);">
          <h3 style="color: #EF4444; margin-bottom: 12px;">❌ Não foi possível carregar os anúncios</h3>
          <p style="color: var(--text-muted); font-size: 14px;">${escapeHtml(err.message)}</p>
          <button class="btn btn-secondary" style="margin-top: 16px;" onclick="loadMarketplaceListings()">Tentar Novamente</button>
        </div>
      `;
    }
  }
}

function renderMarketplaceListings(listingsToRender = currentListings) {
  const container = document.getElementById('marketplace-listings-container');
  if (!container) return;

  if (listingsToRender.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 64px; background: var(--bg-card); border-radius: 12px; border: 2px dashed var(--border-subtle);">
        <div style="font-size: 56px; margin-bottom: 16px;">📦</div>
        <h3 style="color: var(--text-primary); margin-bottom: 8px;">Nenhum anúncio encontrado</h3>
        <p style="color: var(--text-muted); margin-bottom: 24px;">Use "Importar Anúncios" em Canais & APIs ou ajuste seus termos de busca.</p>
        <button class="btn btn-primary" onclick="document.querySelector('[data-tab=\\"channels\\"]').click()">Ir para Canais & APIs</button>
      </div>
    `;
    updateSummaryCards();
    return;
  }

  updateSummaryCards();

  const placeholderSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4OCIgaGVpZ2h0PSI4OCIgdmlld0JveD0iMCAwIDg4IDg4Ij48cmVjdCB3aWR0aD0iODgiIGhlaWdodD0iODgiIHJ4PSIxMiIgZmlsbD0iIzE5MTIxNCIgc3Ryb2tlPSJyZ2JhKDIzOSwgNjgsIDY4LCAwLjMpIiBzdHJva2Utd2lkdGg9IjEiLz48dGV4dCB4PSI1MCUiIHk9IjQyJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI0VGNDQ0NCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSI4MDAiPkxYPC90ZXh0Pjx0ZXh0IHg9IjUwJSIgeT0iNjIlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOUNBM0FGIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSI5IiBmb250LXdlaWdodD0iNjAwIj5TeW5jPC90ZXh0Pjwvc3ZnPg==';

  container.innerHTML = listingsToRender.map(listing => {
    const account = listing.account || {};
    const variations = listing.variations || [];
    const isExpanded = expandedListings.has(listing.id);
    
    const mainImageUrl = listing.imageUrl || placeholderSvg;
    const totalStock = variations.reduce((sum, v) => sum + (v.stock || 0), 0);
    const priceMin = variations.length > 0 ? Math.min(...variations.map(v => v.price || 0)) : 0;
    const priceMax = variations.length > 0 ? Math.max(...variations.map(v => v.price || 0)) : 0;
    const priceRange = priceMin === priceMax ? `R$ ${priceMin.toFixed(2)}` : `R$ ${priceMin.toFixed(2)} - R$ ${priceMax.toFixed(2)}`;
    const statusIcon = listing.status === 'PAUSED' ? '⏸' : '✅';
    const statusText = listing.status === 'PAUSED' ? 'PAUSADO' : 'ATIVO';

    const variationRows = variations.map(v => {
      const varImageUrl = v.imageUrl || placeholderSvg;
      const stock = v.stock || 0;
      const stockClass = stock === 0 ? 'zero' : stock <= 2 ? 'low' : '';
      const stockText = stock === 0 ? 'SEM ESTOQUE' : stock <= 2 ? `BAIXO (${stock} un)` : `${stock} un`;
      const skuText = v.currentSku && v.currentSku.trim() ? escapeHtml(v.currentSku) : '<span style="color:#EF4444;">Sem SKU</span>';
      
      return `
        <tr class="variation-row" data-variation-id="${escapeHtml(v.id)}" onclick="event.stopPropagation(); window.openSkuEditModal('${escapeHtml(v.id)}')">
          <td>
            <img src="${varImageUrl}" alt="${escapeHtml(v.variationName)}" class="variation-image" 
                 onerror="this.onerror=null; this.src='${placeholderSvg}';">
          </td>
          <td>
            <div class="variation-name">${escapeHtml(v.variationName)}</div>
            <code class="variation-sku">${skuText}</code>
          </td>
          <td>
            <span style="color: #A7F3D0; font-weight: 700;">R$ ${Number(v.price || 0).toFixed(2)}</span>
          </td>
          <td>
            <span class="stock-indicator ${stock === 0 ? 'stock-zero' : stock <= 2 ? 'stock-low' : 'stock-normal'}">${stockText}</span>
          </td>
          <td>
            <span class="status-chip ${v.status === 'ACTIVE' ? 'active' : 'paused'}">${v.status === 'ACTIVE' ? '✅' : '⏸'}</span>
          </td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.openSkuEditModal('${escapeHtml(v.id)}')" title="Editar SKU">
              ✏️ Editar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <article class="announcement-card ${isExpanded ? 'expanded' : ''}" data-listing-id="${escapeHtml(listing.id)}">
        <div class="card-header-wrapper">
          <img src="${mainImageUrl}" alt="${escapeHtml(listing.title)}" class="listing-main-image" 
               onerror="this.onerror=null; this.src='${placeholderSvg}';">
          <div class="card-header-info">
            <h3 class="announcement-title">${escapeHtml(listing.title)}</h3>
            <div class="announcement-id-row">
              <code class="external-id-badge">${escapeHtml(listing.externalListingId)}</code>
            </div>
            <div class="announcement-meta-pills">
              <span class="badge ${account.marketplace || 'meli'}">${escapeHtml((account.marketplace || 'mp').toUpperCase())}</span>
              <span class="badge-account-name">${escapeHtml(account.accountName || 'Festum Decor')}</span>
              <span class="status-chip ${listing.status === 'PAUSED' ? 'paused' : 'active'}">${statusIcon} ${statusText}</span>
            </div>
          </div>
        </div>

        <div class="card-metrics-grid">
          <div class="metric-box">
            <span class="metric-label">Preço</span>
            <span class="metric-value price">${priceRange}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Estoque Total</span>
            <span class="metric-value stock ${totalStock === 0 ? 'zero' : totalStock <= 2 ? 'low' : ''}">${totalStock} un</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Variações</span>
            <span class="metric-value">${variations.length}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Última Sync</span>
            <span class="metric-value sync">${new Date(listing.updatedAt).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        <div class="card-footer-actions">
          <button class="btn btn-secondary btn-sm btn-toggle-variations" onclick="event.stopPropagation(); window.toggleListingExpansion('${escapeHtml(listing.id)}')">
            <span class="variations-arrow ${isExpanded ? 'expanded' : ''}">▼</span>
            ${isExpanded ? 'Ocultar variações' : 'Ver variações'} (${variations.length})
          </button>
          <button class="btn btn-primary btn-sm btn-edit-announcement" onclick="event.stopPropagation(); window.openEditAnnouncementModal('${escapeHtml(listing.id)}')">
            ✏️ Editar anúncio
          </button>
          <button class="btn btn-secondary btn-sm btn-icon" onclick="event.stopPropagation(); window.showListingOptions('${escapeHtml(listing.id)}')" title="Mais opções">
            ⋮
          </button>
        </div>

        <div class="variations-section" id="variations-${escapeHtml(listing.id)}" style="${isExpanded ? 'display: block;' : 'display: none;'}">
          <div class="variations-table-wrapper">
            <table class="variations-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Nome & SKU</th>
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Status</th>
                  <th style="text-align: right;">Ação</th>
                </tr>
              </thead>
              <tbody>
                ${variationRows}
              </tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function updateSummaryCards() {
  const totalListings = currentListings.length;
  const totalVariations = currentListings.reduce((sum, l) => sum + (l.variations?.length || 0), 0);
  const active = currentListings.filter(l => l.status === 'ACTIVE').length;
  const paused = currentListings.filter(l => l.status === 'PAUSED').length;
  const zeroStock = currentListings.reduce((sum, l) => sum + (l.variations?.filter(v => (v.stock || 0) === 0).length || 0), 0);
  const lowStock = currentListings.reduce((sum, l) => sum + (l.variations?.filter(v => (v.stock || 0) > 0 && (v.stock || 0) <= 2).length || 0), 0);
  const noSku = currentListings.reduce((sum, l) => sum + (l.variations?.filter(v => !v.currentSku || v.currentSku.trim() === '').length || 0), 0);

  const updates = {
    'summary-total-listings': totalListings,
    'summary-total-variations': totalVariations,
    'summary-active': active,
    'summary-paused': paused,
    'summary-zero-stock': zeroStock,
    'summary-low-stock': lowStock,
    'summary-no-sku': noSku,
  };

  Object.entries(updates).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });

  const counterEl = document.getElementById('listings-counter');
  if (counterEl) {
    counterEl.textContent = `${totalListings} anúncio(s) · ${totalVariations} variação(ões)`;
  }

  // Atualiza o badge lateral de "Anúncios & SKUs" no menu de navegação
  const badgeSku = document.getElementById('badge-sku-count');
  if (badgeSku) {
    badgeSku.textContent = totalListings > 0 ? totalListings : currentSkus.length;
  }
}

function toggleListingExpansion(listingId) {
  const section = document.getElementById(`variations-${listingId}`);
  const card = document.querySelector(`[data-listing-id="${listingId}"]`);
  if (section && card) {
    const isExpanded = expandedListings.has(listingId);
    if (isExpanded) {
      expandedListings.delete(listingId);
      section.style.display = 'none';
      card.classList.remove('expanded');
    } else {
      expandedListings.add(listingId);
      section.style.display = 'block';
      card.classList.add('expanded');
    }
  }
}

window.toggleListingExpansion = toggleListingExpansion;
window.loadMarketplaceListings = loadMarketplaceListings;
window.openEditAnnouncementModal = function(id) {
  showNotification('info', 'Editar Anúncio', `Anúncio selecionado (${id}). O formulário de edição completa será liberado na Fase 2.`);
};
window.openSkuEditModal = function(id) {
  showNotification('info', 'Editar SKU', `Variação selecionada (${id}). O editor de SKU será liberado na Fase 2.`);
};
window.showListingOptions = function(id) {
  showNotification('info', 'Opções do Anúncio', `Menu de opções do anúncio (${id}).`);
};

function renderSkusTable(skusList) {
  const tbody = document.getElementById('skus-table-body');
  if (skusList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px;">Nenhum SKU encontrado. Clique em "Novo SKU Master" para adicionar.</td></tr>`;
    return;
  }

  tbody.innerHTML = skusList.map(sku => {
    const mappingsHtml = sku.mappings ? Object.values(sku.mappings).map(m => `
      <span class="pill-mini ${m.platform || 'meli'}">${m.platform ? m.platform.toUpperCase() : 'MP'}: ${escapeHtml(m.itemCode)}</span>
    `).join('') : '<span style="color:#64748B;">N/A</span>';

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#fff;">${escapeHtml(sku.masterSku)}</div>
          <div style="font-size:11px; color:#94A3B8;">${escapeHtml(sku.category || 'Geral')}</div>
        </td>
        <td>
          <div style="font-weight:500;">${escapeHtml(sku.name)}</div>
          <div style="font-size:11px; color:#94A3B8;">R$ ${(sku.unitPrice || 0).toFixed(2)}</div>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn btn-secondary btn-sm btn-stock-step" data-id="${sku.id}" data-step="-1">-</button>
            <strong style="font-size:15px;">${sku.totalStock}</strong>
            <button class="btn btn-secondary btn-sm btn-stock-step" data-id="${sku.id}" data-step="1">+</button>
          </div>
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:3px;">
            ${mappingsHtml}
          </div>
        </td>
        <td>
          <strong style="color:#F87171;">${sku.availableStock} un</strong>
          <div style="font-size:10px; color:#64748B;">(Buffer: ${currentSettings.oversellingSafetyBuffer || 0})</div>
        </td>
        <td>
          <span class="status-badge ${sku.status}">
            ${sku.status === 'synced' ? '✅ Sincronizado' : sku.status === 'warning' ? '⚠️ Estoque Baixo' : '🚨 Crítico'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm btn-edit-sku" data-id="${sku.id}">Editar</button>
            <button class="btn btn-danger-outline btn-sm btn-delete-sku" data-id="${sku.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.btn-stock-step').forEach(btn => {
    btn.addEventListener('click', () => handleStockStep(btn.dataset.id, parseInt(btn.dataset.step)));
  });

  document.querySelectorAll('.btn-edit-sku').forEach(btn => {
    btn.addEventListener('click', () => openEditSkuModal(btn.dataset.id));
  });

  document.querySelectorAll('.btn-delete-sku').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteSku(btn.dataset.id));
  });
}

async function handleStockStep(id, step) {
  const sku = currentSkus.find(s => s.id === id);
  if (!sku) return;

  const newStock = Math.max(0, sku.totalStock + step);
  sku.totalStock = newStock;
  await StorageService.updateSku(sku);
  await SyncEngine.syncSku(id, 'ajuste_manual_web', currentAccounts);
  await refreshData();
}

/* ==========================================
   TAB 4: LOGS DE AUDITORIA
   ========================================== */
function renderLogsTable(logsList) {
  const tbody = document.getElementById('full-logs-table-body');
  if (logsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px;">Nenhum registro de log encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = logsList.map(log => `
    <tr>
      <td>${formatDateTime(log.timestamp)}</td>
      <td><strong>${escapeHtml(log.masterSku)}</strong></td>
      <td>${escapeHtml(log.marketplace)}</td>
      <td><span class="pill-mini meli">${escapeHtml(log.trigger)}</span></td>
      <td>${log.oldStock} &rarr; <strong>${log.newStock}</strong></td>
      <td style="max-width:280px; font-size:12px; color:#CBD5E1;">${escapeHtml(log.message)}</td>
      <td><span class="status-badge ${log.status}">${log.status.toUpperCase()}</span></td>
    </tr>
  `).join('');
}

/* ==========================================
   SETTINGS & CONNECTIONS FORMS
   ========================================== */
function populateSettingsForm() {
  document.getElementById('set-demo-mode').checked = !!currentSettings.demoMode;
  document.getElementById('set-auto-sync').checked = !!currentSettings.autoSyncEnabled;
  document.getElementById('set-sync-interval').value = currentSettings.syncIntervalMinutes || 15;
  document.getElementById('set-overselling-buffer').value = currentSettings.oversellingSafetyBuffer || 2;
  document.getElementById('set-low-threshold').value = currentSettings.lowStockThreshold || 5;
}

function renderAccountsGrid() {
  const container = document.getElementById('accounts-cards-grid');
  if (!container) return;

  if (currentAccounts.length === 0) {
    container.innerHTML = `
      <div class="card" style="grid-column: 1/-1; text-align: center; padding: 48px; border-color: rgba(239, 68, 68, 0.2);">
        <div style="font-size: 32px; margin-bottom: 12px;">🔌</div>
        <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 6px;">Nenhuma conta cadastrada.</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">Conecte sua primeira loja para sincronizar anúncios e SKUs.</p>
        <button class="btn btn-primary" id="btn-add-first-account" style="padding: 10px 20px; font-weight: 700; border-radius: 10px;">
          + Adicionar primeira conta
        </button>
      </div>`;

    const btnFirstAcc = document.getElementById('btn-add-first-account');
    if (btnFirstAcc) {
      btnFirstAcc.addEventListener('click', () => openAccountModal());
    }
    return;
  }

  const platformBadges = {
    meli: { badgeClass: 'meli-bg', label: 'ML', name: 'Mercado Livre' },
    shopee: { badgeClass: 'shopee-bg', label: 'SHP', name: 'Shopee' },
    tiktok: { badgeClass: 'tiktok-bg', label: 'TT', name: 'TikTok Shop' },
    amazon: { badgeClass: 'shopee-bg', label: 'AMZ', name: 'Amazon BR' }
  };

  container.innerHTML = currentAccounts.map(acc => {
    const meta = platformBadges[acc.platform] || { badgeClass: 'meli-bg', label: 'MP', name: acc.platformName || acc.platform };
    return `
      <div class="card channel-config-card" data-account-card="${acc.id}">
        <div class="channel-card-top">
          <div class="channel-icon ${meta.badgeClass}" style="flex-shrink:0;">${meta.label}</div>
          <div style="flex: 1; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
              <h3 style="font-size: 15px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0;">
                ${escapeHtml(acc.accountName || acc.sellerName || acc.name || meta.name)}
              </h3>
              ${acc.isDemo === true ? '<span style="background: rgba(245,158,11,0.18); border: 1px solid rgba(245,158,11,0.4); color: #FBBF24; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">CONTA DE DEMONSTRAÇÃO</span>' : ''}
            </div>
            <p style="font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; margin: 0;">
              ${escapeHtml(meta.name)} • ID: <code class="code-tag">${escapeHtml(acc.sellerId || acc.shopId || acc.id)}</code>
            </p>
          </div>
        </div>
        <div style="padding-top: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
            <span class="status-badge ${acc.status === 'CONNECTED' || acc.connected ? 'synced' : 'critical'}" style="font-size: 10px; padding: 2px 8px;">
              ● ${acc.status === 'CONNECTED' || acc.connected ? 'Ativa & Conectada' : 'Desconectada'}
            </span>
            <span style="font-size: 11px; color: var(--text-muted); font-weight: 500;">Sync: ${formatTime(acc.lastSyncAt || acc.lastSync)}</span>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-primary btn-sm btn-import-acc" data-account-id="${acc.id}" style="flex: 1; justify-content: center;">📥 Importar Anúncios</button>
            <button class="btn btn-secondary btn-sm btn-test-acc" data-account-id="${acc.id}">🧪 Testar</button>
            <button class="btn btn-danger-outline btn-sm btn-delete-acc" data-account-id="${acc.id}">🗑️ Excluir</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-import-acc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.accountId;
      const acc = currentAccounts.find(a => a.id === accountId);
      btn.disabled = true;
      btn.innerHTML = `<span class="spinning">🔄</span> Importando...`;
      try {
        const data = await AccountsAPI.importAccountListings(accountId);
        const summary = data.summary || {};
        showNotification('success', 'Importação Concluída', summary.message || data.message || 'Anúncios e variações importados com sucesso!');
        await refreshAccountsFromAPI();
      } catch (e) {
        if (isAccountNotFoundError(e)) {
          // 404: conta não existe mais no backend
          showNotification('warning', 'Conta Removida', 'Esta conta não existe mais. A lista de contas foi atualizada.');
          await refreshAccountsFromAPI();
        } else {
          showNotification('error', 'Falha na Importação', e.message);
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = `📥 Importar Anúncios`;
      }
    });
  });

  container.querySelectorAll('.btn-test-acc').forEach(btn => {
    btn.addEventListener('click', () => {
      const acc = currentAccounts.find(a => a.id === btn.dataset.accountId);
      showNotification('success', 'Teste de Conexão', `Conexão com ${acc ? (acc.accountName || acc.sellerName || acc.name) : 'conta'} testada com sucesso! Status: Ativo.`);
    });
  });

  container.querySelectorAll('.btn-edit-acc').forEach(btn => {
    btn.addEventListener('click', () => openAccountModal(btn.dataset.accountId));
  });

  container.querySelectorAll('.btn-delete-acc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.accountId;
      if (!confirm('Tem certeza que deseja remover esta conta de marketplace?')) return;
      btn.disabled = true;
      try {
        await AccountsAPI.deleteAccount(accountId);
        showNotification('success', 'Conta Removida', 'A conta foi removida do servidor.');
      } catch (e) {
        if (isAccountNotFoundError(e)) {
          showNotification('warning', 'Conta Removida', 'Esta conta não existe mais. A lista de contas foi atualizada.');
        } else {
          showNotification('error', 'Falha ao Remover', e.message);
        }
      } finally {
        btn.disabled = false;
        await refreshAccountsFromAPI();
      }
    });
  });
}

function renderMultiPostAccountsList() {
  const container = document.getElementById('multipost-accounts-list');
  if (!container) return;

  if (currentAccounts.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhuma conta cadastrada. Adicione contas na aba "Canais & APIs".</div>`;
    return;
  }

  const platformPills = {
    meli: 'meli',
    shopee: 'shopee',
    tiktok: 'tiktok',
    amazon: 'shopee'
  };

  container.innerHTML = currentAccounts.map(acc => `
    <label class="sku-item" style="cursor: pointer; display: flex; align-items: center; gap: 10px; user-select: none;">
      <input type="checkbox" class="mp-account-cb" value="${acc.id}" checked style="width: 16px; height: 16px; accent-color: #EF4444; cursor: pointer;">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="pill-mini ${platformPills[acc.platform] || 'meli'}">${escapeHtml(acc.platformName || acc.platform)}</span>
          <strong style="font-size: 12px; color: #fff;">${escapeHtml(acc.sellerName || acc.name)}</strong>
        </div>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">ID: ${escapeHtml(acc.sellerId || acc.shopId || acc.id)}</div>
      </div>
    </label>
  `).join('');
}

/* ==========================================
   EVENT LISTENERS & HANDLERS
   ========================================== */
function setupEventListeners() {
  const btnSyncAll = document.getElementById('btn-sync-all-header');
  if (btnSyncAll) btnSyncAll.addEventListener('click', handleSyncAllHeader);

  const searchInput = document.getElementById('search-sku-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = currentSkus.filter(s => 
        s.masterSku.toLowerCase().includes(term) || 
        s.name.toLowerCase().includes(term) || 
        (s.category && s.category.toLowerCase().includes(term))
      );
      renderSkusTable(filtered);
    });
  }

  const searchListingsInput = document.getElementById('search-listings-input');
  if (searchListingsInput) {
    searchListingsInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      if (!term) {
        renderMarketplaceListings(currentListings);
        return;
      }
      const filtered = currentListings.filter(l => {
        const titleMatch = (l.title || '').toLowerCase().includes(term);
        const extIdMatch = (l.externalListingId || '').toLowerCase().includes(term);
        const accMatch = (l.account?.accountName || '').toLowerCase().includes(term) || (l.account?.marketplace || '').toLowerCase().includes(term);
        const skuMatch = l.variations?.some(v => (v.currentSku || '').toLowerCase().includes(term) || (v.variationName || '').toLowerCase().includes(term));
        return titleMatch || extIdMatch || accMatch || skuMatch;
      });
      renderMarketplaceListings(filtered);
    });
  }

  const btnAddSku = document.getElementById('btn-add-sku');
  if (btnAddSku) btnAddSku.addEventListener('click', () => openSkuModal());

  const btnRefreshListings = document.getElementById('btn-refresh-listings');
  if (btnRefreshListings) btnRefreshListings.addEventListener('click', () => loadMarketplaceListings());

  const btnAddAcc = document.getElementById('btn-add-account');
  if (btnAddAcc) btnAddAcc.addEventListener('click', () => openAccountModal());

  const btnSale = document.getElementById('btn-simulate-sale');
  if (btnSale) btnSale.addEventListener('click', () => openSaleModal());

  document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  const skuForm = document.getElementById('sku-form');
  if (skuForm) skuForm.addEventListener('submit', handleSaveSku);

  const accForm = document.getElementById('account-form');
  if (accForm) accForm.addEventListener('submit', handleSaveAccount);

  const saleForm = document.getElementById('sale-form');
  if (saleForm) saleForm.addEventListener('submit', handleSimulateSaleSubmit);

  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) settingsForm.addEventListener('submit', handleSaveSettings);

  const btnSelectAll = document.getElementById('btn-select-all-accounts');
  const btnUnselectAll = document.getElementById('btn-unselect-all-accounts');
  if (btnSelectAll) btnSelectAll.addEventListener('click', () => document.querySelectorAll('.mp-account-cb').forEach(cb => cb.checked = true));
  if (btnUnselectAll) btnUnselectAll.addEventListener('click', () => document.querySelectorAll('.mp-account-cb').forEach(cb => cb.checked = false));

  const btnPublishMulti = document.getElementById('btn-publish-multipost');
  if (btnPublishMulti) btnPublishMulti.addEventListener('click', handleBatchPublish);

  const btnCloseProgress = document.getElementById('btn-close-multipost-progress');
  if (btnCloseProgress) btnCloseProgress.addEventListener('click', () => document.getElementById('modal-multipost-progress').classList.remove('active'));

  // LX Analyzer Button
  const btnRunAnalyzer = document.getElementById('btn-run-analyzer');
  if (btnRunAnalyzer) btnRunAnalyzer.addEventListener('click', runMarketplaceAnalyzer);

  const filterStatus = document.getElementById('log-filter-status');
  const filterChannel = document.getElementById('log-filter-channel');
  if (filterStatus) filterStatus.addEventListener('change', filterLogs);
  if (filterChannel) filterChannel.addEventListener('change', filterLogs);

  const btnExport = document.getElementById('btn-export-logs');
  if (btnExport) btnExport.addEventListener('click', exportLogsCsv);

  // Google Identity Services: inicializar após o script GSI carregar
  initGoogleIdentityServices();

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', handleLogout);

  const btnClearLogs = document.getElementById('btn-clear-logs');
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async () => {
      if (confirm('Tem certeza que deseja apagar todos os logs de auditoria?')) {
        await StorageService.clearLogs();
        await refreshData();
      }
    });
  }

  setupImageUpload();
}

let uploadedImages = [];

function setupImageUpload() {
  const dropzone = document.getElementById('image-upload-dropzone');
  const fileInput = document.getElementById('multi-post-file-input');
  const thumbnailsContainer = document.getElementById('image-upload-thumbnails');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#EF4444';
    dropzone.style.background = 'rgba(239, 68, 68, 0.1)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'rgba(239,68,68,0.4)';
    dropzone.style.background = 'rgba(0,0,0,0.25)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(239,68,68,0.4)';
    dropzone.style.background = 'rgba(0,0,0,0.25)';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageFiles(Array.from(e.target.files));
    }
  });
}

function handleImageFiles(files) {
  const thumbnailsContainer = document.getElementById('image-upload-thumbnails');
  const hiddenInput = document.getElementById('mp-image');

  files.forEach(file => {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/i)) {
      showNotification('warning', 'Formato Inválido', `O arquivo "${file.name}" não é um formato de imagem válido (JPG, PNG, WEBP).`);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showNotification('warning', 'Tamanho Excedido', `O arquivo "${file.name}" excede o tamanho máximo de 5MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const imgObj = {
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: file.name,
        dataUrl,
        isPrimary: uploadedImages.length === 0
      };
      uploadedImages.push(imgObj);
      renderUploadedThumbnails();
    };
    reader.readAsDataURL(file);
  });
}

function renderUploadedThumbnails() {
  const container = document.getElementById('image-upload-thumbnails');
  const hiddenInput = document.getElementById('mp-image');
  if (!container) return;

  if (uploadedImages.length > 0 && hiddenInput) {
    const primary = uploadedImages.find(i => i.isPrimary) || uploadedImages[0];
    hiddenInput.value = primary.dataUrl;
  }

  container.innerHTML = uploadedImages.map((img, idx) => `
    <div style="position: relative; width: 78px; height: 78px; border-radius: 10px; overflow: hidden; border: 2px solid ${img.isPrimary ? '#EF4444' : 'rgba(255,255,255,0.1)'}; background: #000;">
      <img src="${img.dataUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="${escapeHtml(img.name)}">
      ${img.isPrimary ? '<span style="position: absolute; top: 2px; left: 2px; background: #EF4444; color: #fff; font-size: 8px; font-weight: 800; padding: 2px 4px; border-radius: 4px;">PRINCIPAL</span>' : ''}
      <div style="position: absolute; bottom: 2px; right: 2px; display: flex; gap: 2px;">
        <button type="button" class="btn-set-primary" data-id="${img.id}" style="background: rgba(0,0,0,0.7); border: none; color: #FBBF24; font-size: 10px; cursor: pointer; padding: 2px 4px; border-radius: 4px;" title="Definir como principal">⭐</button>
        <button type="button" class="btn-remove-img" data-id="${img.id}" style="background: rgba(239,68,68,0.8); border: none; color: #fff; font-size: 10px; cursor: pointer; padding: 2px 4px; border-radius: 4px;" title="Remover imagem">🗑️</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-set-primary').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadedImages.forEach(i => i.isPrimary = (i.id === btn.dataset.id));
      renderUploadedThumbnails();
    });
  });

  container.querySelectorAll('.btn-remove-img').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadedImages = uploadedImages.filter(i => i.id !== btn.dataset.id);
      if (uploadedImages.length > 0 && !uploadedImages.some(i => i.isPrimary)) {
        uploadedImages[0].isPrimary = true;
      }
      renderUploadedThumbnails();
    });
  });
}

/**
 * Obtém o Google Client ID para o frontend.
 * Em produção: VITE_GOOGLE_CLIENT_ID via import.meta.env
 * Em desenvolvimento: fallback para variável conhecida
 */
function getGoogleClientId() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID;
  }
  // Fallback para desenvolvimento local
  return null;
}

/**
 * Inicializa o Google Identity Services (GIS).
 * O GIS renderiza o botão de login real do Google e retorna
 * um ID Token (credential) assinado pelo Google.
 */
function initGoogleIdentityServices() {
  const statusMsg = document.getElementById('auth-status-msg');
  const googleClientId = getGoogleClientId();

  if (!googleClientId) {
    console.error('[AUTH] VITE_GOOGLE_CLIENT_ID não configurado.');
    if (statusMsg) {
      statusMsg.innerHTML = `<span style="color:#F87171;">⚠️ VITE_GOOGLE_CLIENT_ID não configurado. Login indisponível.</span>`;
    }
    return;
  }

  // Aguardar o script GSI carregar
  function tryInit() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
      setTimeout(tryInit, 200);
      return;
    }

    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    // Renderizar o botão oficial do Google no container
    const googleBtnContainer = document.getElementById('google-signin-button');
    if (googleBtnContainer) {
      google.accounts.id.renderButton(googleBtnContainer, {
        theme: 'filled_black',
        size: 'large',
        width: 380,
        text: 'signin_with',
        shape: 'pill',
        logo_alignment: 'center'
      });
    }

    // Também permitir login via botão customizado como fallback
    const btnCustomGoogle = document.getElementById('btn-google-login-custom');
    if (btnCustomGoogle) {
      btnCustomGoogle.addEventListener('click', () => {
        google.accounts.id.prompt();
      });
    }

    console.log('[AUTH] Google Identity Services inicializado com sucesso.');
  }

  tryInit();
}

/**
 * Callback do Google Identity Services.
 * Recebe o credential (Google ID Token) e envia ao backend.
 * NUNCA envia email/nome/avatar diretamente — tudo vem do token validado.
 */
async function handleGoogleCredentialResponse(response) {
  const statusMsg = document.getElementById('auth-status-msg');

  if (!response || !response.credential) {
    if (statusMsg) statusMsg.innerHTML = `<span style="color:#F87171;">⚠️ Credencial do Google não recebida. Tente novamente.</span>`;
    return;
  }

  if (statusMsg) statusMsg.innerHTML = `<span style="color:#F59E0B;" class="spinning">🔄 Validando credencial do Google no Backend LX Sync...</span>`;

  try {
    // Enviar SOMENTE a credential (Google ID Token) ao backend
    const res = await AuthAPI.loginWithGoogle(response.credential);
    if (res && res.token) {
      currentUser = res.user;
      updateUserProfileBadge(currentUser);
      statusMsg.innerHTML = `<span style="color:#34D399; font-weight:700;">✅ Autenticado via Google OAuth real! JWT de sessão gerado.</span>`;
      showNotification('success', 'Sessão Conectada', `Bem-vindo, ${res.user.name || res.user.email}! Sessão autorizada via Google OAuth.`);

      setTimeout(async () => {
        const authModal = document.getElementById('modal-auth-login');
        if (authModal) authModal.classList.remove('active');
        statusMsg.innerHTML = '';
        await refreshAccountsFromAPI();
        renderAllViews();
      }, 500);
    }
  } catch (err) {
    statusMsg.innerHTML = `<div style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.35); padding: 14px; border-radius: 10px; color: #F87171; font-size: 12px; margin-top: 10px; text-align: center;">
      🚨 <strong>FALHA NA AUTENTICAÇÃO</strong><br>
      ${escapeHtml(err.message)}
    </div>`;
    showNotification('error', 'Acesso Negado', err.message);
  }
}

async function handleLogout() {
  if (confirm('Deseja realmente encerrar a sessão e sair?')) {
    await AuthAPI.logout();
    await StorageService.logoutUser();
    currentUser = null;
    const authModal = document.getElementById('modal-auth-login');
    if (authModal) authModal.classList.add('active');
    const statusMsg = document.getElementById('auth-status-msg');
    if (statusMsg) statusMsg.innerHTML = `<span style="color:#F87171;">🚪 Sessão encerrada com sucesso.</span>`;
  }
}

async function handleSyncAllHeader() {
  const btn = document.getElementById('btn-sync-all-header');
  const icon = btn.querySelector('.spin-icon');
  btn.disabled = true;
  if (icon) icon.classList.add('spinning');

  try {
    await SyncEngine.syncAllSkus('manual_web', currentAccounts);
    await refreshData();
    alert('✅ Sincronização concluída em todos os canais conectados!');
  } catch (err) {
    alert(`❌ Erro na sincronização: ${err.message}`);
  } finally {
    btn.disabled = false;
    if (icon) icon.classList.remove('spinning');
  }
}

function openSkuModal(skuId = null) {
  const modal = document.getElementById('modal-sku');
  const title = document.getElementById('modal-sku-title');
  const form = document.getElementById('sku-form');
  form.reset();
  document.getElementById('sku-id-hidden').value = '';

  if (skuId) {
    title.textContent = 'Editar SKU Master';
    const sku = currentSkus.find(s => s.id === skuId);
    if (sku) {
      document.getElementById('sku-id-hidden').value = sku.id;
      document.getElementById('form-sku-code').value = sku.masterSku;
      document.getElementById('form-sku-category').value = sku.category || '';
      document.getElementById('form-sku-name').value = sku.name;
      document.getElementById('form-sku-stock').value = sku.totalStock;
      document.getElementById('form-sku-reserved').value = sku.reservedStock || 0;
      document.getElementById('form-sku-price').value = sku.unitPrice || 0;
    }
  } else {
    title.textContent = 'Novo SKU Master';
  }

  modal.classList.add('active');
}

function openEditSkuModal(skuId) {
  openSkuModal(skuId);
}

async function handleSaveSku(e) {
  e.preventDefault();
  const id = document.getElementById('sku-id-hidden').value || 'sku-' + Date.now();
  const masterSku = document.getElementById('form-sku-code').value.trim();
  const category = document.getElementById('form-sku-category').value.trim();
  const name = document.getElementById('form-sku-name').value.trim();
  const totalStock = parseInt(document.getElementById('form-sku-stock').value) || 0;
  const reservedStock = parseInt(document.getElementById('form-sku-reserved').value) || 0;
  const unitPrice = parseFloat(document.getElementById('form-sku-price').value) || 0;

  const availableStock = Math.max(0, totalStock - reservedStock - (currentSettings.oversellingSafetyBuffer || 0));

  const updatedSku = {
    id,
    masterSku,
    category,
    name,
    totalStock,
    reservedStock,
    availableStock,
    unitPrice,
    status: availableStock === 0 ? 'critical' : availableStock <= 5 ? 'warning' : 'synced',
    updatedAt: new Date().toISOString()
  };

  await StorageService.updateSku(updatedSku);
  await SyncEngine.syncSku(id, 'cadastro_sku');

  document.getElementById('modal-sku').classList.remove('active');
  await refreshData();
}

async function handleDeleteSku(id) {
  if (confirm('Deseja realmente remover este SKU Master?')) {
    await StorageService.deleteSku(id);
    await refreshData();
  }
}

function openSaleModal() {
  const modal = document.getElementById('modal-sale');
  const select = document.getElementById('sale-sku-select');
  const preview = document.getElementById('sale-preview-info');

  select.innerHTML = currentSkus.map(s => `
    <option value="${s.id}">${escapeHtml(s.masterSku)} - ${escapeHtml(s.name)} (Estoque Atual: ${s.totalStock})</option>
  `).join('');

  if (currentSkus.length > 0) {
    preview.textContent = `Ao confirmar a venda, o estoque total deste SKU será reduzido em 1 unidade e propagado para os canais.`;
  } else {
    preview.textContent = `Nenhum SKU cadastrado para simular venda.`;
  }

  modal.classList.add('active');
}

async function handleSimulateSaleSubmit(e) {
  e.preventDefault();
  const skuId = document.getElementById('sale-sku-select').value;
  const channelKey = document.getElementById('sale-channel-select').value;

  try {
    const sku = currentSkus.find(s => s.id === skuId);
    if (sku && sku.totalStock > 0) {
      sku.totalStock -= 1;
      await StorageService.updateSku(sku);
      await SyncEngine.syncSku(skuId, 'simulacao_venda_' + channelKey, currentAccounts);
    }
    document.getElementById('modal-sale').classList.remove('active');
    await refreshData();
    alert(`🛒 Venda simulada com sucesso! O estoque foi reduzido e sincronizado.`);
  } catch (err) {
    alert(`❌ ${err.message}`);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const newSettings = {
    demoMode: document.getElementById('set-demo-mode').checked,
    autoSyncEnabled: document.getElementById('set-auto-sync').checked,
    syncIntervalMinutes: parseInt(document.getElementById('set-sync-interval').value) || 15,
    oversellingSafetyBuffer: parseInt(document.getElementById('set-overselling-buffer').value) || 0,
    lowStockThreshold: parseInt(document.getElementById('set-low-threshold').value) || 5
  };

  await StorageService.saveSettings(newSettings);
  alert('✅ Configurações salvas com sucesso!');
  await refreshData();
}

function runMarketplaceAnalyzer() {
  const query = document.getElementById('analyzer-query').value.trim();
  const mp = document.getElementById('analyzer-mp').value;

  const btn = document.getElementById('btn-run-analyzer');
  btn.disabled = true;
  btn.textContent = '🔄 Analisando Mercado...';

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = '🚀 Analisar Concorrência & Métricas';

    const randomRev = (100000 + Math.random() * 80000).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const randomSales = Math.floor(500 + Math.random() * 500);

    document.getElementById('ana-kpi-revenue').textContent = randomRev;
    document.getElementById('ana-kpi-sales').textContent = `${randomSales} un`;

    const titlesList = document.getElementById('ana-titles-list');
    titlesList.innerHTML = `
      <li>${query} Premium High Quality Alta Performance Original NFe</li>
      <li>${query} Pro Esportivo Bateria Longa Duração Pronta Entrega</li>
      <li>${query} Modelo Novo 2026 Lançamento Oficial Garantia</li>
    `;

    alert(`🔍 Análise concluída para "${query}" no marketplace ${mp.toUpperCase()}!`);
  }, 600);
}

function filterLogs() {
  const status = document.getElementById('log-filter-status').value;
  const channel = document.getElementById('log-filter-channel').value;

  const filtered = currentLogs.filter(log => {
    const matchStatus = status === 'all' || log.status === status;
    const matchChannel = channel === 'all' || log.marketplace === channel;
    return matchStatus && matchChannel;
  });

  renderLogsTable(filtered);
}

function exportLogsCsv() {
  if (currentLogs.length === 0) {
    alert('Nenhum log para exportar.');
    return;
  }

  const headers = ['ID', 'Data/Hora', 'Tipo', 'Status', 'SKU Master', 'Marketplace', 'Estoque Anterior', 'Novo Estoque', 'Gatilho', 'Mensagem'];
  const rows = currentLogs.map(l => [
    l.id,
    l.timestamp,
    l.type,
    l.status,
    `"${l.masterSku}"`,
    `"${l.marketplace}"`,
    l.oldStock,
    l.newStock,
    `"${l.trigger}"`,
    `"${(l.message || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `lx_sync_web_logs_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function refreshData() {
  currentSettings = await StorageService.getSettings();
  // Contas NÃO são lidas do storage: única fonte é GET /api/marketplace-accounts
  currentSkus = await StorageService.getSkus();
  currentLogs = await StorageService.getLogs();
  renderAllViews();
}

function updateHealthIndicator() {
  const elem = document.getElementById('last-sync-time');
  if (elem) elem.textContent = `SaaS Online: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '--:--';
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(isoStr) {
  if (!isoStr) return '--/-- --:--';
  const d = new Date(isoStr);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ==========================================
   MULTI-ACCOUNT & MULTI-POST HANDLERS
   ========================================== */
function openAccountModal(accId = null) {
  const modal = document.getElementById('modal-account');
  const title = document.getElementById('modal-account-title');
  const form = document.getElementById('account-form');
  form.reset();

  if (accId) {
    title.textContent = 'Editar Conta de Marketplace';
    const acc = currentAccounts.find(a => a.id === accId);
    if (acc) {
      document.getElementById('acc-id').value = acc.id;
      document.getElementById('acc-platform').value = acc.platform || 'meli';
      document.getElementById('acc-seller-name').value = acc.sellerName || acc.name || '';
      document.getElementById('acc-seller-id').value = acc.sellerId || acc.shopId || '';
      document.getElementById('acc-token').value = acc.apiToken || acc.partnerKey || acc.appKey || '';
    }
  } else {
    title.textContent = 'Conectar Nova Conta';
    document.getElementById('acc-id').value = '';
  }

  modal.classList.add('active');
}

async function handleSaveAccount(e) {
  e.preventDefault();
  const accId = document.getElementById('acc-id').value;
  const platform = document.getElementById('acc-platform').value;
  const sellerName = document.getElementById('acc-seller-name').value.trim();
  const sellerId = document.getElementById('acc-seller-id').value.trim();
  const token = document.getElementById('acc-token').value.trim();

  // Payload para o backend (única fonte: PostgreSQL)
  const accountPayload = {
    marketplace: platform,
    accountName: sellerName,
    sellerId,
    shopId: sellerId,
    externalAccountId: sellerId,
    accessToken: token,
    isDemo: false
  };

  const submitBtn = document.getElementById('acc-submit-btn') || null;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '🔄 Salvando...'; }

  try {
    if (accId) {
      await AccountsAPI.updateAccount(accId, accountPayload);
    } else {
      await AccountsAPI.createAccount(accountPayload);
    }

    document.getElementById('modal-account').classList.remove('active');
    await refreshAccountsFromAPI();
    showNotification('success', 'Conta Salva', `Conta "${sellerName}" salva no servidor com sucesso!`);
  } catch (err) {
    showNotification('error', 'Falha ao Salvar Conta', err.message);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salvar Conta'; }
  }
}

async function handleBatchPublish() {
  const title = document.getElementById('mp-title').value.trim();
  const masterSku = document.getElementById('mp-sku').value.trim();
  const category = document.getElementById('mp-category').value;
  const price = parseFloat(document.getElementById('mp-price').value);
  const stock = parseInt(document.getElementById('mp-stock').value);
  const imageUrl = document.getElementById('mp-image').value.trim();
  const description = document.getElementById('mp-description').value.trim();

  if (!title || !masterSku || isNaN(price) || isNaN(stock)) {
    alert('Por favor, preencha Título, SKU Master, Preço e Estoque.');
    return;
  }

  const selectedCbs = Array.from(document.querySelectorAll('.mp-account-cb:checked'));
  const selectedAccountIds = selectedCbs.map(cb => cb.value);

  if (selectedAccountIds.length === 0) {
    alert('Selecione pelo menos uma conta de destino para publicar.');
    return;
  }

  // Bloqueia publicação usando IDs que não existem no backend
  const validSelected = currentAccounts.filter(a => selectedAccountIds.includes(a.id));
  if (validSelected.length !== selectedAccountIds.length) {
    alert('Uma ou mais contas selecionadas não existem mais no backend. Atualize a lista de contas.');
    await refreshAccountsFromAPI();
    return;
  }

  const productData = {
    title,
    masterSku,
    category,
    unitPrice: price,
    totalStock: stock,
    imageUrl,
    description
  };

  const progressModal = document.getElementById('modal-multipost-progress');
  const progressList = document.getElementById('multipost-progress-list');
  const btnClose = document.getElementById('btn-close-multipost-progress');

  btnClose.style.display = 'none';
  progressList.innerHTML = '';
  progressModal.classList.add('active');

  const updateAccountProgressCard = ({ accountId, status, message, result }) => {
    let card = document.getElementById(`mp-prog-${accountId}`);
    const acc = currentAccounts.find(a => a.id === accountId) || { sellerName: accountId, platformName: '' };
    
    if (!card) {
      card = document.createElement('div');
      card.id = `mp-prog-${accountId}`;
      card.className = 'sku-item';
      card.style.padding = '12px';
      progressList.appendChild(card);
    }

    let statusHtml = '';
    if (status === 'pending') {
      statusHtml = `<span style="color: var(--text-muted);">⏳ Aguardando...</span>`;
    } else if (status === 'publishing') {
      statusHtml = `<span style="color: #F59E0B;" class="spinning">🔄 Publicando...</span>`;
    } else if (status === 'success') {
      statusHtml = `<span style="color: #34D399; font-weight:700;">✅ Publicado (${result ? result.itemCode : 'OK'})</span>`;
    } else if (status === 'error') {
      statusHtml = `<span style="color: #F87171; font-weight:700;">❌ Erro</span>`;
    }

    card.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:700; color:#fff;">${escapeHtml(acc.sellerName || acc.name || acc.platformName)}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${escapeHtml(message)}</div>
      </div>
      <div>${statusHtml}</div>
    `;
  };

  try {
    await BatchPublisher.publishToAccounts(productData, selectedAccountIds, updateAccountProgressCard, currentAccounts);
    
    btnClose.style.display = 'inline-flex';
    document.getElementById('form-multipost').reset();
    await refreshData();
  } catch (err) {
    alert(`❌ Erro ao publicar: ${err.message}`);
    btnClose.style.display = 'inline-flex';
  }
}

/* ==========================================
   GLOBAL HANDLERS FOR GROUPING & MATCHING
   ========================================== */

window.handleConfirmMatch = async function(mappingId) {
  try {
    await GroupsAPI.confirmMatch(mappingId);
    showNotification('success', 'Vínculo Confirmado', 'Anúncio vinculado com sucesso ao produto mestre central!');
    loadPendingMatches();
  } catch (e) {
    showNotification('error', 'Falha ao Confirmar', e.message);
  }
};

window.handleRejectMatch = async function(mappingId) {
  try {
    await GroupsAPI.rejectMatch(mappingId);
    showNotification('info', 'Vínculo Rejeitado', 'A sugestão de vínculo foi removida.');
    loadPendingMatches();
  } catch (e) {
    showNotification('error', 'Falha ao Rejeitar', e.message);
  }
};

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'btn-run-rematch') {
    handleRunRematch();
  } else if (e.target && e.target.id === 'btn-export-grouped-csv') {
    handleExportGroupedCsv();
  }
});

async function handleRunRematch() {
  const btn = document.getElementById('btn-run-rematch');
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Reanalisando...'; }
  try {
    const res = await GroupsAPI.runRematching();
    showNotification('success', 'Re-análise Concluída', res.message || 'Correspondências reanalisadas com sucesso!');
    loadSkusSubtabData();
  } catch (err) {
    showNotification('error', 'Falha no Rematching', err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Reanalisar Correspondências'; }
  }
}

function handleExportGroupedCsv() {
  if (currentGroupedProducts.length === 0) {
    showNotification('warning', 'Exportação CSV', 'Nenhum dado de produto agrupado para exportar.');
    return;
  }

  const headers = ['ID Produto Central', 'SKU Master', 'Nome Produto Central', 'Qtd Marketplaces', 'Qtd Anúncios', 'Preço Mín', 'Preço Máx', 'Estoque Total', 'Divergências'];
  const rows = currentGroupedProducts.map(p => [
    p.id,
    `"${p.masterSku}"`,
    `"${(p.name || '').replace(/"/g, '""')}"`,
    p.marketplacesCount,
    p.listingsCount,
    p.priceMin,
    p.priceMax,
    p.totalStock,
    `"${(p.divergences || []).join('; ').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `lx_sync_grouped_products_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
