/**
 * CORS Config — LX Sync Marketplace
 * Lista de origens permitidas: ALLOWED_ORIGINS (separadas por vírgula),
 * com FRONTEND_URL como fallback temporário.
 */

/**
 * Normaliza uma origem: remove espaços e barras finais.
 */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

/**
 * Monta a lista de origens permitidas a partir de ALLOWED_ORIGINS
 * (vírgula separada) com FRONTEND_URL como fallback temporário.
 */
export function parseAllowedOrigins(allowedOriginsRaw: string | undefined, frontendUrlRaw: string | undefined): string[] {
  const origins: string[] = [];

  if (allowedOriginsRaw) {
    for (const part of allowedOriginsRaw.split(',')) {
      const normalized = normalizeOrigin(part);
      if (normalized) origins.push(normalized);
    }
  }

  // Fallback temporário: FRONTEND_URL (mantido por compatibilidade)
  if (frontendUrlRaw) {
    const normalized = normalizeOrigin(frontendUrlRaw);
    if (normalized && !origins.includes(normalized)) origins.push(normalized);
  }

  return origins;
}

/**
 * Verifica se uma origem recebida (exatamente como vem no header Origin)
 * está na lista de origens permitidas.
 */
export function isOriginAllowed(origin: string | null | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin.trim().replace(/\/+$/, ''));
}
