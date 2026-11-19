import type Database from 'better-sqlite3';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import { db } from './db.ts';

const AUTH_SECRET = process.env.AUTH_SECRET || 'noah-command-center-dev-secret-change-in-prod';
export const SESSION_COOKIE_NAME = 'noah_session';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 gün

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Date.now() + TOKEN_TTL_MS,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed.sub;
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: TOKEN_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
  });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  const userId = verifySessionToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Oturum doğrulanamadı. Lütfen giriş yapın.' });
    return;
  }
  const exists = db.prepare(`SELECT id FROM profiles WHERE id = ?`).get(userId);
  if (!exists) {
    res.status(401).json({ error: 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.' });
    return;
  }
  req.userId = userId;
  next();
}

export const SOLO_OWNER_EMAIL = (process.env.OWNER_EMAIL || 'emircsql@gmail.com').trim().toLowerCase();
export const SOLO_OWNER_INITIAL_PASSWORD = process.env.OWNER_PASSWORD || 'Emir7#Komuta2026';

export function ensureSoloOwnerAccount(
  dbInstance: Database.Database,
  newId: () => string,
  nowIso: () => string,
  ensureUserSettings: (userId: string) => unknown
): void {
  const row = dbInstance.prepare(`SELECT COUNT(*) as count FROM profiles`).get() as { count: number };
  if (row.count > 0) return;

  const id = newId();
  const now = nowIso();
  dbInstance.prepare(
    `INSERT INTO profiles (id, email, full_name, role_title, avatar_url, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
  ).run(id, SOLO_OWNER_EMAIL, 'Noah', 'Kurucu & Sistem Mimarı', hashPassword(SOLO_OWNER_INITIAL_PASSWORD), now, now);

  ensureUserSettings(id);
}
