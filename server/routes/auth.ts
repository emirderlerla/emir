import { Router } from 'express';
import {
  clearSessionCookie,
  hashPassword,
  requireAuth,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
  type AuthenticatedRequest,
} from '../auth.ts';
import { db, ensureUserSettings, logActivity, nowIso } from '../db.ts';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ singleUserMode: true });
});

router.post('/register', (_req, res) => {
  res.status(403).json({
    error: 'Bu sistem tek kullanıcılıdır; yeni hesap oluşturma devre dışı bırakılmıştır.',
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    res.status(400).json({ error: 'E-posta ve şifre zorunludur.' });
    return;
  }

  const row = db.prepare(`SELECT * FROM profiles WHERE email = ?`).get(normalizedEmail) as
    | (Record<string, unknown> & { id: string; password_hash: string })
    | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'E-posta adresi veya şifre hatalı.' });
    return;
  }

  const token = signSessionToken(row.id);
  setSessionCookie(res, token);
  const settings = ensureUserSettings(row.id);

  res.json({
    user: {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role_title: row.role_title,
      avatar_url: row.avatar_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    settings,
    token,
  });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db
    .prepare(`SELECT id, email, full_name, role_title, avatar_url, created_at, updated_at FROM profiles WHERE id = ?`)
    .get(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'Kullanıcı profili bulunamadı.' });
    return;
  }
  const settings = ensureUserSettings(req.userId!);
  res.json({ user, settings });
});

router.patch('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const { full_name, role_title, email, current_password, new_password } = req.body as {
    full_name?: string;
    role_title?: string;
    email?: string;
    current_password?: string;
    new_password?: string;
  };

  const current = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(userId) as
    | (Record<string, unknown> & { password_hash: string; email: string; full_name: string; role_title: string })
    | undefined;

  if (!current) {
    res.status(404).json({ error: 'Profil bulunamadı.' });
    return;
  }

  let nextPasswordHash = current.password_hash;
  if (new_password) {
    if (!current_password || !verifyPassword(current_password, current.password_hash)) {
      res.status(400).json({ error: 'Mevcut şifre doğrulanamadı.' });
      return;
    }
    if (new_password.length < 6) {
      res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
      return;
    }
    nextPasswordHash = hashPassword(new_password);
  }

  const nextEmail = email ? email.trim().toLowerCase() : current.email;
  const nextName = full_name !== undefined ? full_name.trim() || current.full_name : current.full_name;
  const nextRole = role_title !== undefined ? role_title.trim() : current.role_title;

  db.prepare(
    `UPDATE profiles SET email = ?, full_name = ?, role_title = ?, password_hash = ?, updated_at = ? WHERE id = ?`
  ).run(nextEmail, nextName, nextRole, nextPasswordHash, nowIso(), userId);

  logActivity(userId, 'profile', userId, nextName, 'Profil güncellendi', '');

  const updated = db
    .prepare(`SELECT id, email, full_name, role_title, avatar_url, created_at, updated_at FROM profiles WHERE id = ?`)
    .get(userId);
  res.json({ user: updated });
});

export default router;
