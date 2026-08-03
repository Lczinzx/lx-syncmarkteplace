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
    id: 'acc-meli-1',
    platform: 'meli',
    platformName: 'Mercado Livre',
    sellerId: 'ML-BR-892301',
    sellerName: 'Loja Principal - Tech & Style',
    connected: true,
    status: 'active',
    lastSync: new Date().toISOString(),
    apiToken: 'APP_USR-7890123456-ML-MOCK-TOKEN-1'
  },
  {
    id: 'acc-meli-2',
    platform: 'meli',
    platformName: 'Mercado Livre',
    sellerId: 'ML-BR-441209',
    sellerName: 'Loja Outlet - Tech Express',
    connected: true,
    status: 'active',
    lastSync: new Date().toISOString(),
    apiToken: 'APP_USR-9988-ML-MOCK-TOKEN-2'
  },
  {
    id: 'acc-shopee-1',
    platform: 'shopee',
    platformName: 'Shopee',
    sellerId: 'SHP-992104',
    sellerName: 'TechStyle Oficial Shopee',
    connected: true,
    status: 'active',
    lastSync: new Date().toISOString(),
    shopId: '992104'
  },
  {
    id: 'acc-tiktok-1',
    platform: 'tiktok',
    platformName: 'TikTok Shop',
    sellerId: 'TTS-441209',
    sellerName: '@techstyle_oficial',
    connected: true,
    status: 'active',
    lastSync: new Date().toISOString(),
    appKey: 'tt_app_key_mock_456'
  }
];

const DEFAULT_SKUS = [
  {
    id: 'sku-001',
    masterSku: 'FONE-BT-PRO-BLK',
    name: 'Fone Bluetooth Pro Noise Cancelling - Preto',
    category: 'Eletrônicos',
    totalStock: 35,
    reservedStock: 2,
    availableStock: 33,
    minStockAlert: 5,
    unitPrice: 289.90,
    status: 'synced',
    updatedAt: new Date().toISOString(),
    mappings: {
      meli: { itemCode: 'MLB-399102931', title: 'Fone de Ouvido Bluetooth Sem Fio Noise Cancelling', stock: 33, active: true },
      shopee: { itemCode: 'SHP-78192039', title: 'Fone Bluetooth Pro Esportivo Bass HD Preto', stock: 33, active: true },
      tiktok: { itemCode: 'TT-4029104', title: 'Fone Bluetooth Premium Sem Fio Pro Black', stock: 33, active: true }
    }
  },
  {
    id: 'sku-002',
    masterSku: 'CAMISA-OVER-WHT-L',
    name: 'Camiseta Oversized Algodão Premium - Branca L',
    category: 'Moda',
    totalStock: 8,
    reservedStock: 1,
    availableStock: 7,
    minStockAlert: 10,
    unitPrice: 119.90,
    status: 'warning', // alerta de estoque baixo
    updatedAt: new Date().toISOString(),
    mappings: {
      meli: { itemCode: 'MLB-401928374', title: 'Camiseta Oversized Masculina Algodão Pima Branca G', stock: 7, active: true },
      shopee: { itemCode: 'SHP-90182736', title: 'Camiseta Oversized Streetwear Algodão 100% Branca', stock: 7, active: true },
      tiktok: { itemCode: 'TT-5519203', title: 'Camisa Oversized Premium Unisex Branca G', stock: 7, active: true }
    }
  },
  {
    id: 'sku-003',
    masterSku: 'SMARTWATCH-ULTRA-S',
    name: 'Smartwatch Series Ultra Amoled GPS - Prata',
    category: 'Gadgets',
    totalStock: 4,
    reservedStock: 2,
    availableStock: 2,
    minStockAlert: 5,
    unitPrice: 459.00,
    status: 'critical',
    updatedAt: new Date().toISOString(),
    mappings: {
      meli: { itemCode: 'MLB-559102834', title: 'Smartwatch Ultra Amoled GPS Original Nfe', stock: 2, active: true },
      shopee: { itemCode: 'SHP-66192048', title: 'Relógio Smartwatch Ultra Prata GPS Esportivo', stock: 2, active: true },
      tiktok: { itemCode: 'TT-9981029', title: 'Smartwatch Ultra Amoled Prata Original TikTok Trend', stock: 2, active: true }
    }
  },
  {
    id: 'sku-004',
    masterSku: 'MOCHILA-EXEC-WATERPROOF',
    name: 'Mochila Executiva Antifurto Impermeável',
    category: 'Acessórios',
    totalStock: 50,
    reservedStock: 0,
    availableStock: 50,
    minStockAlert: 8,
    unitPrice: 229.00,
    status: 'synced',
    updatedAt: new Date().toISOString(),
    mappings: {
      meli: { itemCode: 'MLB-882910394', title: 'Mochila Notebook Executiva Antifurto Impermeável USB', stock: 50, active: true },
      shopee: { itemCode: 'SHP-12893049', title: 'Mochila Masculina Executiva Notebook Resistente Água', stock: 50, active: true },
      tiktok: { itemCode: 'TT-7739201', title: 'Mochila Antifurto Impermeável com Trava e USB', stock: 50, active: true }
    }
  }
];

const DEFAULT_LOGS = [
  {
    id: 'log-101',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    type: 'sync',
    status: 'success',
    masterSku: 'FONE-BT-PRO-BLK',
    marketplace: 'Mercado Livre',
    oldStock: 36,
    newStock: 35,
    trigger: 'venda_detectada',
    message: 'Estoque reduzido de 36 para 35 devido a nova venda no Mercado Livre (Pedido #MLB-99210).'
  },
  {
    id: 'log-102',
    timestamp: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    type: 'propagate',
    status: 'success',
    masterSku: 'FONE-BT-PRO-BLK',
    marketplace: 'Shopee',
    oldStock: 36,
    newStock: 35,
    trigger: 'auto_sync',
    message: 'Estoque sincronizado com sucesso na Shopee para 35 un.'
  },
  {
    id: 'log-103',
    timestamp: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    type: 'propagate',
    status: 'success',
    masterSku: 'FONE-BT-PRO-BLK',
    marketplace: 'TikTok Shop',
    oldStock: 36,
    newStock: 35,
    trigger: 'auto_sync',
    message: 'Estoque sincronizado com sucesso no TikTok Shop para 35 un.'
  },
  {
    id: 'log-104',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    type: 'safety_trigger',
    status: 'warning',
    masterSku: 'SMARTWATCH-ULTRA-S',
    marketplace: 'Todos os canais',
    oldStock: 4,
    newStock: 2,
    trigger: 'overselling_buffer',
    message: 'Alerta de estoque crítico! Reserva de segurança de 2 unidades aplicada.'
  }
];

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
