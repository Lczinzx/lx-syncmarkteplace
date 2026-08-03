import { StorageService } from '../services/storage.js';
import { SyncEngine } from '../services/sync-engine.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadPopupData();

  // Botão Sincronizar Tudo
  const syncBtn = document.getElementById('sync-now-btn');
  syncBtn.addEventListener('click', handleSyncAll);

  // Botão Criar Anúncio Multi-Post
  const quickMultiBtn = document.getElementById('btn-quick-multipost');
  if (quickMultiBtn) {
    quickMultiBtn.addEventListener('click', () => {
      openDashboard('#multipost');
    });
  }

  // Botão Abrir Dashboard
  const openDashBtn = document.getElementById('open-dashboard-btn');
  openDashBtn.addEventListener('click', openDashboard);

  // Link de Configurações no Footer
  const settingsLink = document.getElementById('open-settings-link');
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    openDashboard('#settings');
  });
});

/**
 * Carrega e exibe os dados no Popup
 */
async function loadPopupData() {
  const accounts = await StorageService.getAccounts();
  const settings = await StorageService.getSettings();
  const skus = await StorageService.getSkus();

  // Atualiza pílulas de canais (suporta formato array ou objeto)
  const isArray = Array.isArray(accounts);
  const meliAccs = isArray ? accounts.filter(a => a.platform === 'meli' && a.connected) : (accounts.meli?.connected ? [accounts.meli] : []);
  const shopeeAccs = isArray ? accounts.filter(a => a.platform === 'shopee' && a.connected) : (accounts.shopee?.connected ? [accounts.shopee] : []);
  const tiktokAccs = isArray ? accounts.filter(a => a.platform === 'tiktok' && a.connected) : (accounts.tiktok?.connected ? [accounts.tiktok] : []);

  updatePillCount('pill-meli', 'MeLi', meliAccs.length);
  updatePillCount('pill-shopee', 'Shopee', shopeeAccs.length);
  updatePillCount('pill-tiktok', 'TikTok', tiktokAccs.length);

  // Indicador de modo demo
  const demoBadge = document.getElementById('demo-indicator');
  if (demoBadge) {
    demoBadge.textContent = settings.demoMode ? '⚡ Modo Demo Simulação' : '🟢 Modo Produção APIs';
  }

  // Lista SKUs ordenados pelo menor estoque disponível
  const sortedSkus = [...skus].sort((a, b) => (a.availableStock || 0) - (b.availableStock || 0));
  renderQuickSkus(sortedSkus.slice(0, 4));
}

function updatePillCount(elementId, platformName, count) {
  const pill = document.getElementById(elementId);
  if (!pill) return;
  if (count > 0) {
    pill.classList.add('active');
    pill.innerHTML = `<span class="dot"></span> ${platformName} (${count})`;
  } else {
    pill.classList.remove('active');
    pill.innerHTML = `<span class="dot"></span> ${platformName}`;
  }
}

function renderQuickSkus(skusList) {
  const container = document.getElementById('quick-skus-list');
  if (!container) return;

  if (skusList.length === 0) {
    container.innerHTML = `<div class="loading">Nenhum SKU cadastrado</div>`;
    return;
  }

  container.innerHTML = skusList.map(sku => `
    <div class="sku-item">
      <div class="sku-info">
        <span class="sku-code">${escapeHtml(sku.masterSku)}</span>
        <span class="sku-name">${escapeHtml(sku.name)}</span>
      </div>
      <div class="stock-badge ${sku.status}">
        ${sku.availableStock} un
      </div>
    </div>
  `).join('');
}

/**
 * Lógica do botão de sincronização manual
 */
async function handleSyncAll() {
  const btn = document.getElementById('sync-now-btn');
  const btnText = document.getElementById('sync-btn-text');
  const statusMsg = document.getElementById('sync-status-msg');
  const icon = btn.querySelector('.spin-icon');

  btn.disabled = true;
  btnText.textContent = 'Sincronizando...';
  icon.classList.add('spinning');
  statusMsg.textContent = 'Enviando atualizações para MeLi, Shopee e TikTok...';

  try {
    await SyncEngine.syncAllSkus('manual_popup');
    
    // Atualiza badge no Chrome se disponível
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'UPDATE_BADGE' });
    }

    statusMsg.textContent = '✅ Todos os canais sincronizados!';
    await loadPopupData();
  } catch (err) {
    statusMsg.textContent = `❌ Erro: ${err.message}`;
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btnText.textContent = 'Sincronizar Estoque Agora';
      icon.classList.remove('spinning');
      statusMsg.textContent = 'Pronto para sincronizar';
    }, 2000);
  }
}

/**
 * Abre a interface completa do Dashboard
 */
function openDashboard(hash = '') {
  if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.open) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.sidePanel.open({ windowId: tabs[0].windowId });
      } else {
        chrome.runtime.openOptionsPage();
      }
    });
  } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    // Fallback abrir dashboard na mesma aba ou nova janela
    window.open('../dashboard/index.html' + hash, '_blank');
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
