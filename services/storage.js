/**
 * Storage Service - LX Sync Marketplace
 * Gerencia a persistência local usando chrome.storage.local (ou localStorage em ambiente de teste).
 */

const STORAGE_KEYS = {
  SKUS: 'lx_skus',
  ACCOUNTS: 'lx_accounts',
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

const DEFAULT_ACCOUNTS = [
  {
    id: 'acc-shopee-1',
    platform: 'shopee',
    platformName: 'Shopee',
    sellerId: '2035668',
    sellerName: 'Festum Decor - Shopee Oficial',
    connected: true,
    status: 'active',
    isDemo: true,
    lastSync: new Date().toISOString()
  },
  {
    id: 'acc-meli-1',
    platform: 'meli',
    platformName: 'Mercado Livre',
    sellerId: 'MLB_SELLER_9876',
    sellerName: 'Festum Decor - Mercado Livre',
    connected: true,
    status: 'active',
    isDemo: true,
    lastSync: new Date().toISOString()
  }
];

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

  // --- Conexões / Contas ---
  static async getAccounts() {
    let accounts = await this.get(STORAGE_KEYS.ACCOUNTS, DEFAULT_ACCOUNTS);
    // Se for formato legado (objeto), converte para Array
    if (accounts && !Array.isArray(accounts)) {
      const converted = [];
      for (const [platformKey, accData] of Object.entries(accounts)) {
        converted.push({
          id: `acc-${platformKey}-1`,
          platform: platformKey,
          platformName: accData.name || platformKey,
          sellerId: accData.sellerId || '',
          sellerName: accData.sellerName || accData.name || '',
          connected: accData.connected !== false,
          status: accData.status || 'active',
          lastSync: accData.lastSync || new Date().toISOString(),
          ...accData
        });
      }
      accounts = converted;
      await this.saveAccounts(accounts);
    }
    return accounts;
  }

  static async saveAccounts(accounts) {
    return await this.set(STORAGE_KEYS.ACCOUNTS, accounts);
  }

  static async getAccountById(id) {
    const accounts = await this.getAccounts();
    return accounts.find(a => a.id === id);
  }

  static async addAccount(accountData) {
    const accounts = await this.getAccounts();
    const platformNames = { meli: 'Mercado Livre', shopee: 'Shopee', tiktok: 'TikTok Shop', amazon: 'Amazon BR' };
    const newAccount = {
      id: `acc-${accountData.platform}-${Date.now()}`,
      platformName: platformNames[accountData.platform] || accountData.platform,
      connected: true,
      status: 'active',
      lastSync: new Date().toISOString(),
      ...accountData
    };
    accounts.push(newAccount);
    await this.saveAccounts(accounts);
    return newAccount;
  }

  static async updateAccount(idOrKey, accountData) {
    const accounts = await this.getAccounts();
    const index = accounts.findIndex(a => a.id === idOrKey || a.platform === idOrKey);
    if (index !== -1) {
      accounts[index] = {
        ...accounts[index],
        ...accountData,
        lastSync: new Date().toISOString()
      };
      await this.saveAccounts(accounts);
      return accounts[index];
    } else {
      return await this.addAccount({ id: idOrKey, ...accountData });
    }
  }

  static async deleteAccount(id) {
    const accounts = await this.getAccounts();
    const filtered = accounts.filter(a => a.id !== id);
    await this.saveAccounts(filtered);
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
