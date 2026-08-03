/**
 * Service Worker - LX Sync Marketplace (Background V3)
 * Gerencia alertas de estoque em segundo plano e cron de sincronização automática.
 */

import { StorageService } from '../services/storage.js';
import { SyncEngine } from '../services/sync-engine.js';

const ALARM_SYNC_NAME = 'lx_auto_sync_alarm';

// Inicialização da Extensão
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(async () => {
    console.log('[LX Sync Background] Extensão instalada com sucesso.');
    await setupAlarms();
    await updateBadge();
  });

  // Listener para Alarme (Agendamento)
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_SYNC_NAME) {
      console.log('[LX Sync Background] Executando rotina de sincronização automática...');
      const settings = await StorageService.getSettings();
      if (settings.autoSyncEnabled) {
        await SyncEngine.syncAllSkus('alarm_auto');
        await updateBadge();
      }
    }
  });

  // Listener de mensagens do Popup e Dashboard
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        if (message.action === 'SYNC_ALL') {
          const results = await SyncEngine.syncAllSkus('manual_popup');
          await updateBadge();
          sendResponse({ success: true, results });
        } else if (message.action === 'UPDATE_BADGE') {
          await updateBadge();
          sendResponse({ success: true });
        } else if (message.action === 'UPDATE_SETTINGS') {
          await setupAlarms();
          sendResponse({ success: true });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async response
  });
}

/**
 * Configura o alarme do Chrome baseado no intervalo definido nas configurações
 */
async function setupAlarms() {
  if (typeof chrome === 'undefined' || !chrome.alarms) return;
  const settings = await StorageService.getSettings();
  
  await chrome.alarms.clear(ALARM_SYNC_NAME);
  if (settings.autoSyncEnabled) {
    chrome.alarms.create(ALARM_SYNC_NAME, {
      periodInMinutes: Math.max(1, settings.syncIntervalMinutes || 15)
    });
    console.log(`[LX Sync Background] Auto-sync configurado a cada ${settings.syncIntervalMinutes} min.`);
  }
}

/**
 * Atualiza o selo (Badge) da extensão com a contagem de itens em estoque crítico
 */
async function updateBadge() {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  
  const skus = await StorageService.getSkus();
  const criticalCount = skus.filter(s => s.status === 'critical' || s.availableStock <= 2).length;

  if (criticalCount > 0) {
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
    chrome.action.setBadgeText({ text: String(criticalCount) });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
    chrome.action.setBadgeText({ text: 'OK' });
  }
}
