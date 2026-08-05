export interface MarketplaceValidationResult {
  marketplace: string;
  originalValue: any;
  adaptedValue: any;
  isValid: boolean;
  warnings: string[];
  blockedReason?: string;
}

export class MarketplaceRulesService {
  /**
   * Valida e adapta alterações de acordo com as regras específicas de cada marketplace
   */
  static validateFieldChange(
    marketplace: string,
    field: 'title' | 'sku' | 'price' | 'stock' | 'description',
    newValue: any
  ): MarketplaceValidationResult {
    const mp = marketplace.toLowerCase();
    const warnings: string[] = [];
    let adaptedValue = newValue;
    let isValid = true;
    let blockedReason: string | undefined;

    switch (field) {
      case 'title': {
        const titleStr = String(newValue || '').trim();
        let maxLen = 120;
        if (mp === 'meli' || mp === 'mercadolivre') maxLen = 60;
        else if (mp === 'shopee') maxLen = 120;
        else if (mp === 'tiktok') maxLen = 255;
        else if (mp === 'amazon') maxLen = 200;

        if (titleStr.length > maxLen) {
          adaptedValue = titleStr.substring(0, maxLen);
          warnings.push(`Título truncado para o limite do ${marketplace} (${titleStr.length} -> ${maxLen} caracteres).`);
        }

        // Removendo caracteres não permitidos específicos
        if (mp === 'meli' || mp === 'mercadolivre') {
          if (/[!@#$%^&*()]/g.test(adaptedValue)) {
            adaptedValue = adaptedValue.replace(/[!@#$%^&*()]/g, '');
            warnings.push('Caracteres especiais removidos conforme exigência do Mercado Livre.');
          }
        }
        break;
      }

      case 'sku': {
        const skuStr = String(newValue || '').trim().toUpperCase();
        if (!skuStr) {
          isValid = false;
          blockedReason = `O marketplace ${marketplace} exige um SKU válido (não pode ser vazio).`;
        }
        if (skuStr.length > 50) {
          isValid = false;
          blockedReason = `SKU excede o limite máximo de 50 caracteres para o ${marketplace}.`;
        }
        adaptedValue = skuStr;
        break;
      }

      case 'price': {
        const priceNum = Number(newValue);
        if (isNaN(priceNum) || priceNum <= 0) {
          isValid = false;
          blockedReason = `Preço deve ser um valor numérico positivo.`;
        } else {
          if (mp === 'shopee' && priceNum < 1.0) {
            isValid = false;
            blockedReason = `Shopee exige preço mínimo de R$ 1,00.`;
          }
          if (mp === 'meli' && priceNum < 5.0) {
            warnings.push('Anúncios abaixo de R$ 5,00 no Mercado Livre possuem taxa fixa adicional.');
          }
          adaptedValue = Number(priceNum.toFixed(2));
        }
        break;
      }

      case 'stock': {
        const stockNum = Math.floor(Number(newValue));
        if (isNaN(stockNum) || stockNum < 0) {
          isValid = false;
          blockedReason = `Estoque não pode ser um número negativo.`;
        } else {
          adaptedValue = stockNum;
        }
        break;
      }

      default:
        adaptedValue = newValue;
    }

    return {
      marketplace,
      originalValue: newValue,
      adaptedValue,
      isValid,
      warnings,
      blockedReason
    };
  }
}
