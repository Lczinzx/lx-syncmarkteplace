import {
  APP_STORAGE_VERSION,
  LEGACY_ACCOUNT_KEYS,
  migrateAccountsStorageV5
} from './account-source.js';

function runStorageMigration() {
  if (typeof localStorage === 'undefined') return;
  const currentVersion = localStorage.getItem('lx_storage_version');
  const needsMigration = !currentVersion || parseInt(currentVersion, 10) < APP_STORAGE_VERSION;

  // Migração v5: remove chaves obsoletas de contas (API é a única fonte)
  if (needsMigration) {
    const migration = migrateAccountsStorageV5(localStorage);
    localStorage.setItem('lx_storage_version', String(APP_STORAGE_VERSION));
    console.log(
      `🧹 [STORAGE] Migração para versão ${APP_STORAGE_VERSION} concluída. ` +
      `Chaves de contas removidas: ${migration.removedKeys.join(', ') || 'nenhuma'}.`
    );
  }
}

// Também limpa o chrome.storage (contexto de extensão) das chaves de contas legadas
function purgeChromeStorageAccounts() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(null, (all) => {
    if (!all) return;
    const keysToRemove = LEGACY_ACCOUNT_KEYS.filter(k => all[k] !== undefined);
    const extra = [];
    for (const key of Object.keys(all)) {
      const normalized = key.toLowerCase();
      if (normalized.includes('account') || normalized.includes('conta') || normalized.includes('marketplace')) {
        if (!keysToRemove.includes(key)) keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove);
  });
}

runStorageMigration();
purgeChromeStorageAccounts();

const STORAGE_KEYS = {
  SKUS: 'lx_skus',
  SETTINGS: 'lx_settings',
  LOGS: 'lx_logs',
  AUTH_USER: 'lx_auth_user'
};

const ADMIN_EMAILS = [
  'lucasoliveiradossantos008@gmail.com',
  'festumcontato@gmail.com'
];

const DEFAULT_SETTINGS = {
  autoSyncEnabled: true,
  syncIntervalMinutes: 15,
  oversellingSafetyBuffer: 2, // Quantidade de segurança para evitar venda duplicada
  lowStockThreshold: 5,       // Limite para acionar aviso de estoque baixo
  demoMode: true,             // Se true, usa mock adapters para simular respostas reais de APIs
  notifyOnSyncError: true,
  notifyOnLowStock: true
};

const DEFAULT_SKUS = [];

const DEFAULT_LOGS = [];

export class StorageService {
  /**
   * Helper genérico de leitura
   */
  static async get(key, defaultValue) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([key], (result) => {
          if (result && result[key] !== undefined) {
            resolve(result[key]);
          } else {
            // Inicializa valor padrão se vazio
            chrome.storage.local.set({ [key]: defaultValue });
            resolve(defaultValue);
          }
        });
      } else {
        // Fallback localStorage para navegação comum
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          try {
            resolve(JSON.parse(stored));
          } catch (e) {
            resolve(defaultValue);
          }
        } else {
          localStorage.setItem(key, JSON.stringify(defaultValue));
          resolve(defaultValue);
        }
      }
    });
  }

  /**
   * Helper genérico de escrita
   */
  static async set(key, value) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: value }, () => resolve(true));
      } else {
        localStorage.setItem(key, JSON.stringify(value));
        resolve(true);
      }
    });
  }

  // --- SKUs Master ---
  static async getSkus() {
    return await this.get(STORAGE_KEYS.SKUS, DEFAULT_SKUS);
  }

  static async saveSkus(skus) {
    return await this.set(STORAGE_KEYS.SKUS, skus);
  }

  static async getSkuById(id) {
    const skus = await this.getSkus();
    return skus.find(s => s.id === id);
  }

  static async updateSku(updatedSku) {
    const skus = await this.getSkus();
    const index = skus.findIndex(s => s.id === updatedSku.id);
    if (index !== -1) {
      skus[index] = { ...skus[index], ...updatedSku, updatedAt: new Date().toISOString() };
    } else {
      skus.push({ ...updatedSku, updatedAt: new Date().toISOString() });
    }
    await this.saveSkus(skus);
    return updatedSku;
  }

  static async deleteSku(id) {
    const skus = await this.getSkus();
    const filtered = skus.filter(s => s.id !== id);
    await this.saveSkus(filtered);
    return true;
  }

  // --- Conexões / Contas (FONTE ÚNICA: GET /api/marketplace-accounts) ---
  // O StorageService NÃO persiste mais contas de marketplace.
  // Contas vivem exclusivamente no PostgreSQL e são carregadas pela API.
  static async getAccounts() {
    return [];
  }

  static async saveAccounts() {
    return true;
  }

  static async getAccountById() {
    return null;
  }

  static async addAccount() {
    console.warn('[STORAGE] Contas são gerenciadas pela API (POST /api/marketplace-accounts).');
    return null;
  }

  static async updateAccount() {
    console.warn('[STORAGE] Contas são gerenciadas pela API (PUT /api/marketplace-accounts/:id).');
    return null;
  }

  static async deleteAccount() {
    console.warn('[STORAGE] Contas são gerenciadas pela API (DELETE /api/marketplace-accounts/:id).');
    return true;
  }

  // --- Configurações ---
  static async getSettings() {
    return await this.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }

  static async saveSettings(settings) {
    return await this.set(STORAGE_KEYS.SETTINGS, settings);
  }

  // --- Logs ---
  static async getLogs() {
    return await this.get(STORAGE_KEYS.LOGS, DEFAULT_LOGS);
  }

  static async addLog(entry) {
    const logs = await this.getLogs();
    const newLog = {
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      ...entry
    };
    logs.unshift(newLog); // adiciona no início
    // Mantém máximo 200 logs
    if (logs.length > 200) logs.pop();
    await this.set(STORAGE_KEYS.LOGS, logs);
    return newLog;
  }

  static async clearLogs() {
    await this.set(STORAGE_KEYS.LOGS, []);
    return true;
  }

  // --- Autenticação & Permissões Admin ---
  static getAdminEmails() {
    return ADMIN_EMAILS;
  }

  static isAdmin(email) {
    if (!email) return false;
    const cleanEmail = String(email).trim().toLowerCase();
    return ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === cleanEmail);
  }

  static async getCurrentUser() {
    return await this.get(STORAGE_KEYS.AUTH_USER, null);
  }

  static async setCurrentUser(userObj) {
    return await this.set(STORAGE_KEYS.AUTH_USER, userObj);
  }

  static async logoutUser() {
    return await this.set(STORAGE_KEYS.AUTH_USER, null);
  }
}
