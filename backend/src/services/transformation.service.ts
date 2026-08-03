import { decomposeSku } from './matching.service.js';

export type SkuTransformationType =
  | 'SET_EXACT'
  | 'REPLACE_TEXT'
  | 'REMOVE_TEXT'
  | 'ADD_PREFIX'
  | 'ADD_SUFFIX'
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'TRIM'
  | 'NORMALIZE_SPACES'
  | 'NORMALIZE_SEPARATORS'
  | 'APPLY_TEMPLATE'
  | 'USE_MASTER_SKU';

export interface TransformationRule {
  type: SkuTransformationType;
  exactValue?: string;
  findText?: string;
  replaceText?: string;
  prefix?: string;
  suffix?: string;
  masterSku?: string;
  template?: string; // ex: "{prefix} - {size} - {theme} - {code}"
}

/**
 * Aplica uma transformação determinística em um SKU
 */
export function applySkuTransformation(currentSku: string, rule: TransformationRule): string {
  let result = currentSku || '';

  switch (rule.type) {
    case 'SET_EXACT':
      return rule.exactValue || result;

    case 'USE_MASTER_SKU':
      return rule.masterSku || result;

    case 'REPLACE_TEXT':
      if (rule.findText) {
        result = result.replaceAll(rule.findText, rule.replaceText || '');
      }
      return result;

    case 'REMOVE_TEXT':
      if (rule.findText) {
        result = result.replaceAll(rule.findText, '');
      }
      return result;

    case 'ADD_PREFIX':
      return `${rule.prefix || ''}${result}`;

    case 'ADD_SUFFIX':
      return `${result}${rule.suffix || ''}`;

    case 'UPPERCASE':
      return result.toUpperCase();

    case 'LOWERCASE':
      return result.toLowerCase();

    case 'TRIM':
      return result.trim();

    case 'NORMALIZE_SPACES':
      return result.replace(/\s+/g, ' ').trim();

    case 'NORMALIZE_SEPARATORS':
      // Z-Red50-Zoologico-04 -> Z - Red50 - Zoologico - 04
      return result
        .replace(/[\_\s]+/g, '-')
        .replace(/-+/g, '-')
        .split('-')
        .map(s => s.trim())
        .filter(Boolean)
        .join(' - ');

    case 'APPLY_TEMPLATE': {
      const decomp = decomposeSku(result);
      const template = rule.template || '{prefix} - {size} - {theme} - {code}';
      return template
        .replace('{prefix}', decomp.prefix || 'Z')
        .replace('{size}', decomp.size || 'Red50')
        .replace('{theme}', decomp.theme || 'Geral')
        .replace('{code}', decomp.code || '01');
    }

    default:
      return result;
  }
}
