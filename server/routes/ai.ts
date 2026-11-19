import { Router } from 'express';
import type { PendingAiAction } from '../../src/types/index.ts';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db, ensureUserSettings, newId, nowIso } from '../db.ts';
import {
  executeConfirmedAiAction,
  generateDailyOverview,
  generateWeeklyReview,
  runAiChatTurn,
} from '../gemini.ts';

const router = Router();
router.use(requireAuth);

router.get('/conversations', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const rows = db
    .prepare(`SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(userId);
  res.json({ conversations: rows });
});

router.post('/conversations', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const isEn = String(ensureUserSettings(userId).language || '').toLowerCase().startsWith('en');
  const fallbackTitle = isEn ? 'New Chat' : 'Yeni Sohbet';
  const title = String((req.body as { title?: string }).title || fallbackTitle).trim() || fallbackTitle;
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO ai_conversations (id, user_id, title, model, created_at, updated_at)
     VALUES (?, ?, ?, 'gemini-4-hydrogen', ?, ?)`
  ).run(id, userId, title, now, now);
  const created = db.prepare(`SELECT * FROM ai_conversations WHERE id = ?`).get(id);
  res.status(201).json({ conversation: created });
});

router.delete('/conversations/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const info = db
    .prepare(`DELETE FROM ai_conversations WHERE id = ? AND user_id = ?`)
    .run(req.params.id, userId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Sohbet bulunamadı.' });
    return;
  }
  res.json({ ok: true });
});

router.get('/conversations/:id/messages', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const conv = db
    .prepare(`SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId);
  if (!conv) {
    res.status(404).json({ error: 'Sohbet bulunamadı.' });
    return;
  }

  const rows = db
    .prepare(`SELECT * FROM ai_messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC`)
    .all(req.params.id, userId) as Record<string, unknown>[];

  res.json({
    messages: rows.map((m) => ({
      ...m,
      pending_action: m.pending_action ? JSON.parse(String(m.pending_action)) : null,
    })),
  });
});

router.post('/chat', async (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const { conversationId, message } = req.body as { conversationId?: string; message?: string };
  const cleanMessage = (message || '').trim();
  if (!cleanMessage) {
    res.status(400).json({ error: 'Mesaj boş olamaz.' });
    return;
  }

  let activeConvId = conversationId;
  const now = nowIso();
  let existingConvTitle: string | null = null;
  if (activeConvId) {
    const exists = db
      .prepare(`SELECT id, title FROM ai_conversations WHERE id = ? AND user_id = ?`)
      .get(activeConvId, userId) as { id: string; title: string } | undefined;
    if (!exists) {
      res.status(404).json({ error: 'Sohbet oturumu bulunamadı.' });
      return;
    }
    existingConvTitle = exists.title;
  }

  try {
    const result = await runAiChatTurn(userId, activeConvId, cleanMessage);

    const autoTitle = cleanMessage.length > 42 ? `${cleanMessage.slice(0, 42)}...` : cleanMessage;
    if (!activeConvId) {
      activeConvId = newId();
      db.prepare(
        `INSERT INTO ai_conversations (id, user_id, title, model, created_at, updated_at)
         VALUES (?, ?, ?, 'gemini-4-hydrogen', ?, ?)`
      ).run(activeConvId, userId, autoTitle, now, now);
    } else if (existingConvTitle === 'Yeni Sohbet' || existingConvTitle === 'New Chat') {
      db.prepare(`UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?`).run(
        autoTitle,
        now,
        activeConvId
      );
    }

    const userMsgId = newId();
    db.prepare(
      `INSERT INTO ai_messages (id, user_id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, 'user', ?, ?)`
    ).run(userMsgId, userId, activeConvId, cleanMessage, now);

    const aiMsgId = newId();
    const aiNow = nowIso();
    db.prepare(
      `INSERT INTO ai_messages (id, user_id, conversation_id, role, content, pending_action, action_status, created_at)
       VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)`
    ).run(
      aiMsgId,
      userId,
      activeConvId,
      result.assistantText,
      result.pendingAction ? JSON.stringify(result.pendingAction) : null,
      result.pendingAction ? 'pending' : null,
      aiNow
    );

    db.prepare(`UPDATE ai_conversations SET updated_at = ? WHERE id = ?`).run(aiNow, activeConvId);

    const userMsg = db.prepare(`SELECT * FROM ai_messages WHERE id = ?`).get(userMsgId);
    const aiMsgRow = db.prepare(`SELECT * FROM ai_messages WHERE id = ?`).get(aiMsgId) as Record<string, unknown>;

    res.json({
      conversationId: activeConvId,
      userMessage: userMsg,
      assistantMessage: {
        ...aiMsgRow,
        pending_action: aiMsgRow.pending_action ? JSON.parse(String(aiMsgRow.pending_action)) : null,
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Yapay zeka yanıtı alınamadı.';
    res.status(502).json({ error: errMsg });
  }
});

router.post('/confirm-action', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const { messageId, decision } = req.body as { messageId?: string; decision?: 'confirm' | 'cancel' };
  const msg = db
    .prepare(`SELECT * FROM ai_messages WHERE id = ? AND user_id = ?`)
    .get(messageId, userId) as Record<string, unknown> | undefined;

  if (!msg || !msg.pending_action) {
    res.status(404).json({ error: 'Onay bekleyen işlem bulunamadı.' });
    return;
  }
  if (msg.action_status !== 'pending') {
    res.status(400).json({ error: 'Bu işlem zaten sonuçlandırılmış.' });
    return;
  }

  const isEn = String(ensureUserSettings(userId).language || '').toLowerCase().startsWith('en');

  if (decision === 'cancel') {
    db.prepare(`UPDATE ai_messages SET action_status = 'cancelled' WHERE id = ?`).run(msg.id);
    const followId = newId();
    db.prepare(
      `INSERT INTO ai_messages (id, user_id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, 'assistant', ?, ?)`
    ).run(
      followId,
      userId,
      msg.conversation_id,
      isEn ? 'Proposed action was cancelled by the user.' : 'Önerilen işlem kullanıcı tarafından iptal edildi.',
      nowIso()
    );
    res.json({ status: 'cancelled', message: isEn ? 'Action cancelled.' : 'İşlem iptal edildi.' });
    return;
  }

  try {
    const action = JSON.parse(String(msg.pending_action)) as PendingAiAction;
    const summaryResult = executeConfirmedAiAction(userId, action);
    db.prepare(`UPDATE ai_messages SET action_status = 'executed' WHERE id = ?`).run(msg.id);
    const followId = newId();
    db.prepare(
      `INSERT INTO ai_messages (id, user_id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, 'assistant', ?, ?)`
    ).run(
      followId,
      userId,
      msg.conversation_id,
      isEn ? `Confirmed and applied: ${summaryResult}` : `Onaylandı ve uygulandı: ${summaryResult}`,
      nowIso()
    );
    res.json({ status: 'executed', message: summaryResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : isEn ? 'Could not execute action.' : 'İşlem uygulanamadı.';
    res.status(400).json({ error: message });
  }
});

router.post('/daily-overview', async (req: AuthenticatedRequest, res) => {
  try {
    const overview = await generateDailyOverview(req.userId!);
    res.json({ overview, generatedAt: nowIso() });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Günlük özet oluşturulamadı.';
    res.status(502).json({ error: errMsg });
  }
});

router.post('/weekly-review', async (req: AuthenticatedRequest, res) => {
  try {
    const review = await generateWeeklyReview(req.userId!);
    res.json({ review, generatedAt: nowIso() });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Haftalık değerlendirme oluşturulamadı.';
    res.status(502).json({ error: errMsg });
  }
});

export default router;
