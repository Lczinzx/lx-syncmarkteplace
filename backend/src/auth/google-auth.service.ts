import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

export interface UserSessionPayload {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  avatarUrl?: string;
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export function getAdminEmails(): string[] {
  const envAdmins = process.env.ADMIN_EMAILS || 'lucasoliveiradossantos008@gmail.com,festumcontato@gmail.com';
  return envAdmins.split(',').map(e => e.trim().toLowerCase());
}

export function isAdminEmail(email: string): boolean {
  if (!email) return false;
  const adminList = getAdminEmails();
  return adminList.includes(email.trim().toLowerCase());
}

/**
 * Verifica um Google ID Token real usando google-auth-library.
 * 
 * Validações obrigatórias:
 * - Assinatura válida (verificada por verifyIdToken)
 * - Audience corresponde ao GOOGLE_CLIENT_ID
 * - Issuer é accounts.google.com ou https://accounts.google.com
 * - Token não expirado (verificado por verifyIdToken)
 * - email_verified === true
 * - email presente no payload
 * 
 * NENHUM fallback é permitido. Tokens inválidos sempre geram erro.
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID não está configurado no servidor.');
  }

  // verifyIdToken valida: assinatura, audience, expiração
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Payload do token Google está vazio.');
  }

  // Verificar issuer
  if (!payload.iss || !VALID_ISSUERS.includes(payload.iss)) {
    throw new Error(`Issuer inválido: ${payload.iss}. Esperado: accounts.google.com`);
  }

  // Verificar email presente
  if (!payload.email) {
    throw new Error('Token do Google não contém e-mail.');
  }

  // Verificar email_verified obrigatoriamente
  if (payload.email_verified !== true) {
    throw new Error('O e-mail da conta Google não foi verificado pelo Google.');
  }

  return {
    googleId: payload.sub!,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    avatarUrl: payload.picture,
    emailVerified: true
  };
}

export function generateSessionJWT(userPayload: UserSessionPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET não está configurado no servidor. Impossível gerar token de sessão.');
  }
  return jwt.sign(userPayload, secret, { expiresIn: '24h' });
}

export function verifySessionJWT(token: string): UserSessionPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET não está configurado no servidor. Impossível verificar token de sessão.');
  }
  return jwt.verify(token, secret) as UserSessionPayload;
}
