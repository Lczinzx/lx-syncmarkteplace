/**
 * Prisma Errors — LX Sync Marketplace
 * Helpers para mapear erros do Prisma em mensagens amigáveis,
 * sem vazar detalhes internos do banco para o cliente.
 */

const DB_NOT_INITIALIZED_MESSAGE =
  'O banco de dados ainda não foi inicializado. Aplique as migrations antes de continuar.';

/**
 * Detecta erro do Prisma de "banco não inicializado":
 * P2021 (tabela não existe), P2024 (lock), P2010 (query raw falhou)
 * e fallback de conectividade.
 */
export function isDbNotInitializedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { code?: string; error?: { code?: string } };
  const code = candidate.code ?? candidate.error?.code;
  return code === 'P2021' || code === 'P2024' || code === 'P2010' || code === 'P1001';
}

/**
 * Devolve a mensagem amigável para o cliente. Os detalhes reais do erro
 * devem ser logados no servidor antes desta chamada.
 */
export function toFriendlyDbErrorMessage(err: unknown, fallback: string): string {
  if (isDbNotInitializedError(err)) {
    return DB_NOT_INITIALIZED_MESSAGE;
  }
  return fallback;
}

export { DB_NOT_INITIALIZED_MESSAGE };