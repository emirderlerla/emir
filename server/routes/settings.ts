import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db, ensureUserSettings, logActivity, nowIso } from '../db.ts';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  res.json({ settings: ensureUserSettings(req.userId!) });
});

router.patch('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const current = ensureUserSettings(userId);
  const body = req.body as Record<string, unknown>;

  const maxActive =
    body.max_active_projects !== undefined
      ? Math.min(20, Math.max(1, Number(body.max_active_projects)))
      : current.max_active_projects;
  const allowOverride =
    body.allow_limit_override !== undefined ? Boolean(body.allow_limit_override) : current.allow_limit_override;
  const inactiveDays =
    body.inactive_days_threshold !== undefined
      ? Math.min(90, Math.max(1, Number(body.inactive_days_threshold)))
      : current.inactive_days_threshold;
  const theme = ['dark', 'slate', 'light'].includes(String(body.theme))
    ? String(body.theme)
    : current.theme;
  const requestedLang = body.language !== undefined ? String(body.language).toLowerCase() : '';
  const language = requestedLang
    ? requestedLang.startsWith('en')
      ? 'en-US'
      : 'tr-TR'
    : current.language || 'tr-TR';
  const aiPersona = ['stratejik', 'direkt', 'koc'].includes(String(body.ai_persona))
    ? String(body.ai_persona)
    : current.ai_persona;
  const autoDaily =
    body.ai_auto_daily_summary !== undefined ? Boolean(body.ai_auto_daily_summary) : current.ai_auto_daily_summary;
  const notifyOverdue =
    body.notify_overdue !== undefined ? Boolean(body.notify_overdue) : current.notify_overdue;
  const notifyUpcomingDays =
    body.notify_upcoming_days !== undefined
      ? Math.min(30, Math.max(1, Number(body.notify_upcoming_days)))
      : current.notify_upcoming_days;
  const notifyInactive =
    body.notify_inactive_projects !== undefined
      ? Boolean(body.notify_inactive_projects)
      : current.notify_inactive_projects;

  db.prepare(
    `UPDATE user_settings
     SET max_active_projects = ?, allow_limit_override = ?, inactive_days_threshold = ?, theme = ?, language = ?, ai_persona = ?, ai_auto_daily_summary = ?, notify_overdue = ?, notify_upcoming_days = ?, notify_inactive_projects = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(
    maxActive,
    allowOverride ? 1 : 0,
    inactiveDays,
    theme,
    language,
    aiPersona,
    autoDaily ? 1 : 0,
    notifyOverdue ? 1 : 0,
    notifyUpcomingDays,
    notifyInactive ? 1 : 0,
    nowIso(),
    userId
  );

  const isEn = language === 'en-US';
  logActivity(
    userId,
    'settings',
    userId,
    isEn ? 'Application Settings' : 'Uygulama Ayarları',
    isEn ? 'Settings updated' : 'Ayarlar güncellendi',
    isEn ? `Focus limit: ${maxActive}` : `Odak limiti: ${maxActive}`
  );
  res.json({ settings: ensureUserSettings(userId) });
});

export default router;
