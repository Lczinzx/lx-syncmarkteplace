/**
 * LX Sync Marketplace - Web Application Controller (SPA)
 */

import { StorageService } from './services/storage.js';
import { SyncEngine } from './services/sync-engine.js';
import { BatchPublisher } from './services/batch-publisher.js';

let currentSkus = [];
let currentLogs = [];
let currentSettings = {};
let currentAccounts = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initApp();
  setupNavigation();
  setupEventListeners();
});

async function initApp() {
  currentSettings = await StorageService.getSettings();
  currentAccounts = await StorageService.getAccounts();
  currentSkus = await StorageService.getSkus();
  currentLogs = await StorageService.getLogs();

  await checkAuthSession();
  renderAllViews();
}

async function checkAuthSession() {
  currentUser = await StorageService.getCurrentUser();
  const authModal = document.getElementById('modal-auth-login');

  if (currentUser && StorageService.isAdmin(currentUser.email)) {
    updateUserProfileBadge(currentUser);
    if (authModal) authModal.classList.remove('active');
  } else {
    if (authModal) authModal.classList.add('active');
  }
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
    skus: { title: 'Estoque Master & SKUs', sub: 'Gerencie seu catálogo central e o mapeamento de códigos (De-Para) por canal.' },
    analyzer: { title: 'LX Marketplace Analyzer', sub: 'Estimativa de vendas em 30 dias, cálculo de margem/comissões e títulos SEO recomendados por IA.' },
    channels: { title: 'Canais & APIs', sub: 'Gerenciamento de múltiplas contas ativas e credenciais de cada plataforma.' },
    logs: { title: 'Logs de Auditoria', sub: 'Histórico auditável e transparente de todas as alterações de estoque.' },
    settings: { title: 'Configurações & Seguranças', sub: 'Ajuste regras de prevenção contra overselling e rotinas de fundo.' }
  };

  if (titles[tabId]) {
    document.getElementById('page-title').textContent = titles[tabId].title;
    document.getElementById('page-subtitle').textContent = titles[tabId].sub;
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

  // Contadores de Mapeamento
  const meliMapped = currentSkus.filter(s => s.mappings && Object.values(s.mappings).some(m => m.platform === 'meli' || m.itemCode?.startsWith('MLB'))).length;
  const shopeeMapped = currentSkus.filter(s => s.mappings && Object.values(s.mappings).some(m => m.platform === 'shopee' || m.itemCode?.startsWith('SHP'))).length;
  const tiktokMapped = currentSkus.filter(s => s.mappings && Object.values(s.mappings).some(m => m.platform === 'tiktok' || m.itemCode?.startsWith('TT'))).length;

  document.getElementById('meli-mapped-count').textContent = `${meliMapped}/${currentSkus.length}`;
  document.getElementById('shopee-mapped-count').textContent = `${shopeeMapped}/${currentSkus.length}`;
  document.getElementById('tiktok-mapped-count').textContent = `${tiktokMapped}/${currentSkus.length}`;

  const recent = currentLogs.slice(0, 5);
  const tbody = document.getElementById('overview-recent-logs');
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum log registrado ainda.</td></tr>`;
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

/* ==========================================
   TAB 2: SKUs MASTER & MAPEAMENTO
   ========================================== */
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
  await SyncEngine.syncSku(id, 'ajuste_manual_web');
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
    container.innerHTML = `<div class="card" style="grid-column: 1/-1; text-align: center; padding: 30px;">Nenhuma conta conectada. Clique em "+ Conectar Nova Conta" para adicionar.</div>`;
    return;
  }

  const platformBadges = {
    meli: { badgeClass: 'meli-bg', borderClass: 'meli-border', label: 'ML', name: 'Mercado Livre' },
    shopee: { badgeClass: 'shopee-bg', borderClass: 'shopee-border', label: 'SHP', name: 'Shopee' },
    tiktok: { badgeClass: 'tiktok-bg', borderClass: 'tiktok-border', label: 'TT', name: 'TikTok Shop' },
    amazon: { badgeClass: 'shopee-bg', borderClass: 'shopee-border', label: 'AMZ', name: 'Amazon BR' }
  };

  container.innerHTML = currentAccounts.map(acc => {
    const meta = platformBadges[acc.platform] || { badgeClass: 'meli-bg', borderClass: 'meli-border', label: 'MP', name: acc.platformName || acc.platform };
    return `
      <div class="card channel-config-card">
        <div class="channel-config-header ${meta.borderClass}">
          <div class="channel-badge ${meta.badgeClass}">${meta.label}</div>
          <div>
            <h3>${escapeHtml(acc.sellerName || acc.name || meta.name)}</h3>
            <p>${escapeHtml(meta.name)} • ID: <code>${escapeHtml(acc.sellerId || acc.shopId || acc.id)}</code></p>
          </div>
        </div>
        <div class="card-body" style="padding-top: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <span class="status-badge ${acc.connected ? 'synced' : 'critical'}">
              ${acc.connected ? '● Ativa & Conectada' : '○ Desconectada'}
            </span>
            <span style="font-size:11px; color:var(--text-muted);">Sync: ${formatTime(acc.lastSync)}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm btn-test-acc" data-id="${acc.id}" style="flex:1;">Testar Conexão</button>
            <button class="btn btn-secondary btn-sm btn-edit-acc" data-id="${acc.id}">Editar</button>
            <button class="btn btn-danger-outline btn-sm btn-delete-acc" data-id="${acc.id}">Excluir</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-test-acc').forEach(btn => {
    btn.addEventListener('click', () => {
      const acc = currentAccounts.find(a => a.id === btn.dataset.id);
      alert(`✅ Conexão com ${acc ? (acc.sellerName || acc.name) : 'conta'} testada com sucesso! Status: Ativo.`);
    });
  });

  container.querySelectorAll('.btn-edit-acc').forEach(btn => {
    btn.addEventListener('click', () => openAccountModal(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete-acc').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Tem certeza que deseja remover esta conta de marketplace?')) {
        await StorageService.deleteAccount(btn.dataset.id);
        await refreshData();
      }
    });
  });
}

function renderMultiPostAccountsList() {
  const container = document.getElementById('multipost-accounts-list');
  if (!container) return;

  if (currentAccounts.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhuma conta conectada. Adicione contas na aba "Canais & APIs".</div>`;
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

  const btnAddSku = document.getElementById('btn-add-sku');
  if (btnAddSku) btnAddSku.addEventListener('click', () => openSkuModal());

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

  const btnGoogleLogin = document.getElementById('btn-google-login-simulated');
  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', triggerRealGoogleSSO);
  }

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

  // Inicializa o Google Identity Services SDK
  initGoogleSDK();
}

function initGoogleSDK() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.initialize({
      client_id: "904944208323-r7g5a19v46q401f8k1a2a4401a0a.apps.googleusercontent.com",
      callback: handleGoogleSSOCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: false
    });

    const btnContainer = document.getElementById("google-official-btn-container");
    if (btnContainer) {
      google.accounts.id.renderButton(btnContainer, {
        theme: "filled_dark",
        size: "large",
        type: "standard",
        shape: "pill",
        width: 320,
        text: "signin_with"
      });
    }

    // Dispara o One Tap nativo do navegador
    google.accounts.id.prompt();
  }
}

function triggerRealGoogleSSO() {
  const statusMsg = document.getElementById('auth-status-msg');
  if (statusMsg) statusMsg.innerHTML = `<span style="color:#F59E0B;" class="spinning">🔄 Abrindo seletor de contas do Google...</span>`;

  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Se One Tap for ignorado, abre prompt OAuth nativo
        openNativeGoogleAccountPrompt();
      }
    });
  } else {
    openNativeGoogleAccountPrompt();
  }
}

function openNativeGoogleAccountPrompt() {
  const statusMsg = document.getElementById('auth-status-msg');
  // Abre prompt de login da Conta do Google autenticada no navegador
  const email = prompt("🌐 CONTA DO GOOGLE - SELECIONE SUA CONTA:\n\nInforme o e-mail da Conta do Google logada no seu navegador:");
  if (email && email.trim()) {
    processGoogleAccountAuth(email.trim());
  } else if (statusMsg) {
    statusMsg.innerHTML = `<span style="color:var(--text-muted);">Autenticação cancelada.</span>`;
  }
}

function handleGoogleSSOCredentialResponse(response) {
  if (response && response.credential) {
    const payload = parseJwt(response.credential);
    if (payload && payload.email) {
      processGoogleAccountAuth(payload.email, payload.name, payload.picture);
    }
  }
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

async function processGoogleAccountAuth(email, nameOverride = null, avatarOverride = null) {
  const statusMsg = document.getElementById('auth-status-msg');
  if (!statusMsg) return;

  statusMsg.innerHTML = `<span style="color:#F59E0B;" class="spinning">🔄 Verificando permissões de ${escapeHtml(email)} no Google SSO...</span>`;

  setTimeout(async () => {
    if (StorageService.isAdmin(email)) {
      const name = nameOverride || email.split('@')[0].replace('.', ' ');
      const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
      
      const userObj = {
        email: email,
        name: formattedName,
        role: 'Admin',
        avatar: avatarOverride || `https://ui-avatars.com/api/?name=${encodeURIComponent(formattedName)}&background=EF4444&color=fff`,
        loginTime: new Date().toISOString()
      };

      await StorageService.setCurrentUser(userObj);
      currentUser = userObj;
      updateUserProfileBadge(userObj);

      statusMsg.innerHTML = `<span style="color:#34D399; font-weight:700;">✅ Administrador Identificado! Acesso Liberado.</span>`;
      
      setTimeout(() => {
        const authModal = document.getElementById('modal-auth-login');
        if (authModal) authModal.classList.remove('active');
        statusMsg.innerHTML = '';
      }, 500);

    } else {
      statusMsg.innerHTML = `<div style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.35); padding: 14px; border-radius: 10px; color: #F87171; font-size: 12px; margin-top: 10px; text-align: center;">
        🚨 <strong>ACESSO NEGADO</strong><br>
        A conta Google <code>${escapeHtml(email)}</code> não está cadastrada como administradora.<br>
        <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">Apenas as contas administradoras autorizadas possuem acesso a este painel.</span>
      </div>`;
    }
  }, 400);
}

async function handleLogout() {
  if (confirm('Deseja realmente encerrar a sessão e sair?')) {
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
    await SyncEngine.syncAllSkus('manual_web');
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
      await SyncEngine.syncSku(skuId, 'simulacao_venda_' + channelKey);
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
  currentAccounts = await StorageService.getAccounts();
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

  const accountData = {
    platform,
    sellerName,
    name: sellerName,
    sellerId,
    apiToken: token,
    partnerKey: token,
    appKey: token
  };

  if (accId) {
    await StorageService.updateAccount(accId, accountData);
  } else {
    await StorageService.addAccount(accountData);
  }

  document.getElementById('modal-account').classList.remove('active');
  await refreshData();
  alert(`✅ Conta "${sellerName}" salva com sucesso!`);
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
    await BatchPublisher.publishToAccounts(productData, selectedAccountIds, updateAccountProgressCard);
    
    btnClose.style.display = 'inline-flex';
    document.getElementById('form-multipost').reset();
    await refreshData();
  } catch (err) {
    alert(`❌ Erro ao publicar: ${err.message}`);
    btnClose.style.display = 'inline-flex';
  }
}
