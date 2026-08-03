import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

export interface UserSessionPayload {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  avatarUrl?: string;
}

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export function getAdminEmails(): string[] {
  const envAdmins = process.env.ADMIN_EMAILS || 'lucasoliveiradossantos008@gmail.com,festumcontato@gmail.com';
  return envAdmins.split(',').map(e => e.trim().toLowerCase());
}

export function isAdminEmail(email: string): boolean {
  if (!email) return false;
  const adminList = getAdminEmails();
  return adminList.includes(email.trim().toLowerCase());
}

export async function verifyGoogleToken(idToken: string) {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error('Token do Google não contém e-mail válido.');
    }
    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      avatarUrl: payload.picture
    };
  } catch (error) {
    // Fallback/Simulado em desenvolvimento se Google OAuth Client ID não estiver configurado
    if (process.env.NODE_ENV !== 'production' && idToken.includes('@')) {
      return {
        googleId: `google_sub_${idToken}`,
        email: idToken,
        name: idToken.split('@')[0],
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(idToken)}&background=EF4444&color=fff`
      };
    }
    throw error;
  }
}

export function generateSessionJWT(userPayload: UserSessionPayload): string {
  const secret = process.env.JWT_SECRET || 'lx_sync_super_secret_jwt_key_2026_safe_token';
  return jwt.sign(userPayload, secret, { expiresIn: '24h' });
}

export function verifySessionJWT(token: string): UserSessionPayload {
  const secret = process.env.JWT_SECRET || 'lx_sync_super_secret_jwt_key_2026_safe_token';
  return jwt.verify(token, secret) as UserSessionPayload;
}
