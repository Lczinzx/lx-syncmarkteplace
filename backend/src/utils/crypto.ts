import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getDerivedKey(masterKeyHex?: string): Buffer {
  const master = masterKeyHex || process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
  return crypto.scryptSync(master, 'lxsync_salt_2026', KEY_LENGTH);
}

/**
 * Criptografa dados sensíveis (tokens, keys) com AES-256-GCM
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Formato: iv:tag:encrypted (Base64)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descriptografa segredos armazenados com AES-256-GCM
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Payload criptografado em formato inválido.');
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Mascara tokens e e-mails para logs de auditoria sem expor segredos completos
 */
export function maskSensitiveValue(value: string, visibleChars = 4): string {
  if (!value) return '';
  if (value.length <= visibleChars * 2) {
    return '***';
  }
  return `${value.slice(0, visibleChars)}...${value.slice(-visibleChars)}`;
}
