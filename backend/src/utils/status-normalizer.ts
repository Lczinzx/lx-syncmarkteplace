/**
 * Normaliza rigorosamente qualquer variação de status remota/legada para
 * a constante única 'ACTIVE' ou 'PAUSED'.
 */
export function normalizeListingStatus(status: string | null | undefined, marketplace: string = ''): 'ACTIVE' | 'PAUSED' {
  if (!status) return 'ACTIVE';
  const s = String(status).trim().toUpperCase();
  if (['ACTIVE', 'ATIVO', 'NORMAL', 'PUBLISHED', 'CONNECTED', 'LIVE', 'ITEM_STATUS_NORMAL'].includes(s)) {
    return 'ACTIVE';
  }
  if (['PAUSED', 'PAUSADO', 'UNPUBLISHED', 'INACTIVE', 'BANNED', 'DELETED', 'DISABLED', 'ITEM_STATUS_UNPUBLISHED', 'ITEM_STATUS_BANNED', 'ITEM_STATUS_DELETED'].includes(s)) {
    return 'PAUSED';
  }
  return 'ACTIVE';
}
