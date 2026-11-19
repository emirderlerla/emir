import { GoogleGenAI, ThinkingLevel, Type, type FunctionDeclaration } from '@google/genai';
import type { PendingAiAction } from '../src/types/index.ts';
import { computeControlSummary } from './control.ts';
import {
  db,
  ensureUserSettings,
  logActivity,
  newId,
  nowIso,
  parseTags,
  recalculateProjectProgress,
  touchProjectActivity,
} from './db.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY yapılandırılmamış. Lütfen AI Studio Secrets veya .env üzerinden anahtarı tanımlayın.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const DEFAULT_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
let primaryCooldownUntil = 0;

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('TIMEOUT') ||
    msg.includes('AbortError') ||
    msg.includes('aborted')
  );
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
}

function formatGeminiError(err: unknown, isEn = false): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand') ||
    raw.includes('TIMEOUT') ||
    raw.includes('aborted')
  ) {
    return new Error(
      isEn
        ? 'The AI model is temporarily unavailable due to high demand. Please try again in a few seconds.'
        : 'Yapay zeka modeli şu anda yoğun talep nedeniyle geçici olarak yanıt veremiyor. Lütfen birkaç saniye sonra tekrar deneyin.'
    );
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return new Error(
      isEn
        ? 'Free Tier request quota exceeded. Select a billing-enabled API key in Settings > Secrets or try again shortly.'
        : 'Ücretsiz katman (Free Tier) istek kotası doldu. Kotayı artırmak için Settings > Secrets panelinden faturalandırması etkin bir API anahtarı seçebilir veya kısa bir süre sonra tekrar deneyebilirsiniz.'
    );
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return new Error(
      isEn
        ? 'Could not verify Gemini API key. Please check your API key in Settings > Secrets.'
        : 'Gemini API anahtarı doğrulanamadı. Lütfen Settings > Secrets panelinden API anahtarınızı kontrol edin.'
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

async function callWithTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`TIMEOUT_${ms}ms`)), ms);
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error(`TIMEOUT_${ms}ms`)), {
          once: true,
        });
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function callFallbackWithRetry<T>(
  callModel: (model: string, signal: AbortSignal) => Promise<T>,
  isEn = false
): Promise<T> {
  try {
    return await callWithTimeout(25000, (signal) => callModel(FALLBACK_MODEL, signal));
  } catch (err1) {
    if (isTransientError(err1)) {
      await new Promise((r) => setTimeout(r, 700));
      try {
        return await callWithTimeout(25000, (signal) => callModel(FALLBACK_MODEL, signal));
      } catch (err2) {
        console.error(`[Gemini:${FALLBACK_MODEL}]`, err2 instanceof Error ? err2.message : err2);
        throw formatGeminiError(err2, isEn);
      }
    }
    console.error(`[Gemini:${FALLBACK_MODEL}]`, err1 instanceof Error ? err1.message : err1);
    throw formatGeminiError(err1, isEn);
  }
}

async function generateWithFallback<T>(
  callModel: (model: string, signal: AbortSignal) => Promise<T>,
  isEn = false
): Promise<T> {
  if (Date.now() < primaryCooldownUntil) {
    return callFallbackWithRetry(callModel, isEn);
  }

  try {
    return await callWithTimeout(5500, (signal) => callModel(DEFAULT_MODEL, signal));
  } catch (primaryErr) {
    if (isQuotaError(primaryErr)) {
      primaryCooldownUntil = Date.now() + 60 * 60 * 1000;
    }
    if (isTransientError(primaryErr)) {
      console.warn(
        `[Gemini] ${DEFAULT_MODEL} gecici olarak kullanilamadi, ${FALLBACK_MODEL} modeline gecildi.`
      );
      return callFallbackWithRetry(callModel, isEn);
    }
    console.error(`[Gemini:${DEFAULT_MODEL}]`, primaryErr instanceof Error ? primaryErr.message : primaryErr);
    throw formatGeminiError(primaryErr, isEn);
  }
}

export function buildWorkspaceContext(userId: string): string {
  const settings = ensureUserSettings(userId);
  const control = computeControlSummary(userId);

  const projects = db
    .prepare(
      `SELECT id, name, category, priority, status, start_date, deadline, progress, last_activity_at
       FROM projects WHERE user_id = ? AND is_archived = 0 ORDER BY updated_at DESC LIMIT 30`
    )
    .all(userId) as Record<string, unknown>[];

  const tasks = db
    .prepare(
      `SELECT t.id, t.project_id, p.name as project_name, t.title, t.priority, t.status, t.due_date, t.estimated_minutes, t.actual_minutes, t.completed_at
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.user_id = ? AND t.is_archived = 0
       ORDER BY CASE t.status WHEN 'Tamamlandı' THEN 1 ELSE 0 END, t.due_date ASC LIMIT 60`
    )
    .all(userId) as Record<string, unknown>[];

  const ideas = db
    .prepare(
      `SELECT id, title, category, potential, estimated_difficulty, priority, converted_project_id
       FROM ideas WHERE user_id = ? AND is_archived = 0 ORDER BY created_at DESC LIMIT 25`
    )
    .all(userId) as Record<string, unknown>[];

  const milestones = db
    .prepare(
      `SELECT m.id, m.title, m.due_date, m.is_completed, p.name as project_name
       FROM milestones m JOIN projects p ON p.id = m.project_id
       WHERE m.user_id = ? AND p.is_archived = 0 ORDER BY m.due_date ASC LIMIT 25`
    )
    .all(userId) as Record<string, unknown>[];

  const notes = db
    .prepare(
      `SELECT id, title, project_id, substr(content, 1, 220) as preview, updated_at
       FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 15`
    )
    .all(userId) as Record<string, unknown>[];

  const recentActivity = db
    .prepare(
      `SELECT entity_type, entity_title, action, details, created_at
       FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(userId) as Record<string, unknown>[];

  return JSON.stringify(
    {
      bugun: new Date().toISOString().slice(0, 10),
      kontrol_ozeti: {
        aktif_odak_proje_sayisi: control.activeFocusCount,
        maksimum_aktif_proje_limiti: settings.max_active_projects,
        limit_asildi_mi: control.isOverLimit,
        geciken_gorev_sayisi: control.totalOverdueTasks,
        sonraki_adimsiz_proje_sayisi: control.projectsWithoutNextAction,
        pasif_proje_sayisi: control.inactiveProjectsCount,
        oncelikli_odak_onerisi: control.recommendedAttentionProject?.project.name ?? null,
        riskli_projeler: control.atRiskProjects.slice(0, 5).map((r) => ({
          proje: r.project.name,
          nedenler: r.riskReasons,
          sonraki_adim: r.nextActionTitle,
        })),
      },
      projeler: projects,
      gorevler: tasks,
      fikirler: ideas,
      kilometre_taslari: milestones,
      notlar: notes,
      son_aktiviteler: recentActivity,
    }
  );
}

// Re-close compact JSON properly


const READ_TOOLS: FunctionDeclaration[] = [
  {
    name: 'getWorkspaceSummary',
    description: 'Kullanıcının güncel proje, görev, fikir ve kontrol merkezi özet verilerini getirir.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeCompletedTasks: {
          type: Type.BOOLEAN,
          description: 'Tamamlanmış görevlerin dahil edilip edilmeyeceği.',
        },
      },
    },
  },
  {
    name: 'findInactiveProjects',
    description: 'Belirli gün sayısından uzun süredir aktivite görmemiş veya sonraki adımı eksik projeleri listeler.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

const WRITE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'createProject',
    description: 'Yeni bir proje oluşturmak için kullanıcı onayına sunulacak teklif hazırlar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Proje adı' },
        description: { type: Type.STRING, description: 'Proje açıklaması' },
        category: { type: Type.STRING, description: 'Kategori (ör. Yazılım, Yapay Zeka, Ürün)' },
        priority: { type: Type.STRING, description: 'Düşük, Orta, Yüksek veya Kritik' },
        status: {
          type: Type.STRING,
          description: 'Fikir, Araştırma, Planlama, Geliştirme, Test, Yayınlandı, Beklemede, Donduruldu veya İptal Edildi',
        },
        deadline: { type: Type.STRING, description: 'YYYY-MM-DD formatında teslim tarihi (isteğe bağlı)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'createTask',
    description: 'Bir projeye bağlı veya bağımsız yeni görev oluşturmak için kullanıcı onayına sunulacak teklif hazırlar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Görev başlığı' },
        description: { type: Type.STRING, description: 'Görev açıklaması' },
        project_id: { type: Type.STRING, description: 'Bağlı proje ID (varsa)' },
        priority: { type: Type.STRING, description: 'Düşük, Orta, Yüksek veya Kritik' },
        due_date: { type: Type.STRING, description: 'YYYY-MM-DD formatında son tarih' },
        estimated_minutes: { type: Type.NUMBER, description: 'Tahmini süre (dakika)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'updateTaskStatus',
    description: 'Mevcut bir görevin durumunu güncellemek için kullanıcı onayına sunulacak teklif hazırlar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_id: { type: Type.STRING, description: 'Güncellenecek görevin ID değeri' },
        status: { type: Type.STRING, description: 'Yapılacak, Devam Ediyor, İncelemede veya Tamamlandı' },
      },
      required: ['task_id', 'status'],
    },
  },
  {
    name: 'createMilestone',
    description: 'Bir proje için yeni kilometre taşı eklemek üzere kullanıcı onayına sunulacak teklif hazırlar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        project_id: { type: Type.STRING, description: 'Proje ID' },
        title: { type: Type.STRING, description: 'Kilometre taşı başlığı' },
        due_date: { type: Type.STRING, description: 'YYYY-MM-DD formatında tarih' },
      },
      required: ['project_id', 'title'],
    },
  },
  {
    name: 'createIdea',
    description: 'Fikir havuzuna yeni bir fikir eklemek için kullanıcı onayına sunulacak teklif hazırlar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Fikir başlığı' },
        description: { type: Type.STRING, description: 'Fikir açıklaması' },
        category: { type: Type.STRING, description: 'Kategori' },
        potential: { type: Type.NUMBER, description: '1-5 arası potansiyel puanı' },
        estimated_difficulty: { type: Type.STRING, description: 'Kolay, Orta, Zor veya Çok Zor' },
      },
      required: ['title'],
    },
  },
  {
    name: 'createReminder',
    description: 'Kullanıcı için yeni bir hatırlatıcı oluşturmak üzere onay teklifi hazırlar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Hatırlatıcı başlığı' },
        remind_at: { type: Type.STRING, description: 'ISO tarih-saat (YYYY-MM-DDTHH:mm)' },
        description: { type: Type.STRING, description: 'Açıklama' },
      },
      required: ['title', 'remind_at'],
    },
  },
];

const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));

function summarizeProposedAction(toolName: string, args: Record<string, unknown>, isEn = false): string {
  if (isEn) {
    switch (toolName) {
      case 'createProject':
        return `Create new project: "${String(args.name || '')}" (${String(args.status || 'Planlama')})`;
      case 'createTask':
        return `Create new task: "${String(args.title || '')}" (Priority: ${String(args.priority || 'Orta')})`;
      case 'updateTaskStatus':
        return `Update task status: "${String(args.status || '')}"`;
      case 'createMilestone':
        return `Add milestone: "${String(args.title || '')}"`;
      case 'createIdea':
        return `Add to Idea Pool: "${String(args.title || '')}"`;
      case 'createReminder':
        return `Create reminder: "${String(args.title || '')}" (${String(args.remind_at || '')})`;
      default:
        return `Apply ${toolName}`;
    }
  }
  switch (toolName) {
    case 'createProject':
      return `Yeni proje oluştur: "${String(args.name || '')}" (${String(args.status || 'Planlama')})`;
    case 'createTask':
      return `Yeni görev oluştur: "${String(args.title || '')}" (Öncelik: ${String(args.priority || 'Orta')})`;
    case 'updateTaskStatus':
      return `Görev durumunu güncelle: "${String(args.status || '')}"`;
    case 'createMilestone':
      return `Kilometre taşı ekle: "${String(args.title || '')}"`;
    case 'createIdea':
      return `Fikir havuzuna ekle: "${String(args.title || '')}"`;
    case 'createReminder':
      return `Hatırlatıcı oluştur: "${String(args.title || '')}" (${String(args.remind_at || '')})`;
    default:
      return `${toolName} işlemini uygula`;
  }
}

export async function runAiChatTurn(
  userId: string,
  conversationId: string | undefined,
  userMessage: string
): Promise<{
  assistantText: string;
  pendingAction: PendingAiAction | null;
}> {
  const ai = getGeminiClient();
  const settings = ensureUserSettings(userId);
  const isEn = String(settings.language || '').toLowerCase().startsWith('en');
  const workspaceContext = buildWorkspaceContext(userId);

  const historyRows = conversationId
    ? (db
        .prepare(
          `SELECT role, content FROM ai_messages
           WHERE conversation_id = ? AND user_id = ?
           ORDER BY created_at ASC LIMIT 24`
        )
        .all(conversationId, userId) as { role: string; content: string }[])
    : [];

  const personaHint = isEn
    ? settings.ai_persona === 'direkt'
      ? 'Use a concise, clear, and action-oriented executive assistant tone.'
      : settings.ai_persona === 'koc'
        ? 'Use a motivating yet realistic productivity coach tone focused on execution.'
        : 'Use an analytical, strategic senior product manager tone that clearly surfaces bottlenecks and priorities.'
    : settings.ai_persona === 'direkt'
      ? 'Kısa, net, doğrudan eyleme dönük bir yönetici asistanı üslubu kullan.'
      : settings.ai_persona === 'koc'
        ? 'Motive edici ama gerçekçi, odaklanmayı artıran bir verimlilik koçu üslubu kullan.'
        : 'Analitik, stratejik, darboğazları ve öncelikleri net ortaya koyan kıdemli ürün yöneticisi üslubu kullan.';

  const istanbulNow = new Date().toLocaleString(isEn ? 'en-US' : 'tr-TR', {
    timeZone: 'Europe/Istanbul',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const systemInstruction = isEn
    ? `You are an intelligent, natural, and helpful AI assistant inside Noah Command Center who can chat about any topic and answer general questions.
ALWAYS communicate with the user in English (unless the user explicitly asks you to translate something).
Current date and time in Europe/Istanbul: ${istanbulNow}.

Style & Behavior Rules:
1. Respond directly and naturally to casual greetings ("hi", "hello", "hey", "how are you") and general questions (knowledge, coding, brainstorming, advice, everyday conversation). Do NOT dump project/task reports unprompted or use unnecessary markdown headers.
2. When the user asks about their projects, tasks, ideas, calendar, reminders, or workload, base your answer strictly on the real workspace data below; never fabricate projects, tasks, or metrics.
3. Do NOT call tools for casual chat or general knowledge questions—answer directly. Only call tools when the user explicitly asks to create/update a project, task, idea, milestone, or reminder, or requests a detailed workspace scan. Note: database status/priority fields use internal keys ('Planlama', 'Geliştirme', 'Tamamlandı', 'Orta', etc.); keep those keys when calling write tools, while presenting status/priority in natural English to the user.
4. Keep the maximum active focus project limit of ${settings.max_active_projects} in mind during workspace evaluations.

${personaHint}

CURRENT WORKSPACE DATA (reference only when relevant):
${workspaceContext}`
    : `Sen Noah Command Center içinde yer alan, aynı zamanda her konuda sohbet edebilen ve genel soruları yanıtlayabilen zeki, doğal ve yardımsever bir Türkçe yapay zeka asistanısın.
Kullanıcıyla HER ZAMAN yalnızca Türkçe iletişim kur.
Şu anki güncel Türkiye tarih ve saati: ${istanbulNow} (Europe/Istanbul).

Üslup ve Davranış Kuralları:
1. Gündelik selamlaşmalara ("selam", "naber", "merhaba", "nasılsın" vb.) ve genel sorulara (bilgi, yazılım, fikir üretme, tavsiye, gündelik sohbet vb.) normal, samimi ve akıcı bir yapay zeka asistanı gibi doğrudan yanıt ver. Kullanıcı sormadıkça durduk yere proje/görev raporu dökme ve gereksiz markdown başlıkları kullanma.
2. Kullanıcı projeleri, görevleri, fikirleri, takvimi, hatırlatıcıları veya iş yükü hakkında bir şey sorduğunda aşağıdaki gerçek çalışma alanı verilerine dayanarak yanıt ver; asla olmayan proje, görev veya sayı uydurma.
3. Gündelik sohbet veya genel bilgi sorularında araç (tool) çağırma, doğrudan yanıt ver. Araçları yalnızca kullanıcı açıkça yeni proje/görev/fikir/kilometre taşı/hatırlatıcı oluşturmak veya güncellemek istediğinde ya da detaylı tarama istediğinde kullan.
4. Çalışma alanı değerlendirmelerinde maksimum aktif odak proje limitinin ${settings.max_active_projects} adet olduğunu gözet.

${personaHint}

GÜNCEL ÇALIŞMA ALANI VERİSİ (Yalnızca çalışma alanı ile ilgili sorularda referans al):
${workspaceContext}`;

  const contents = [
    ...historyRows.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  const response1 = await generateWithFallback(
    (model, abortSignal) =>
      ai.models.generateContent({
        model,
        contents,
        config: {
          abortSignal,
          ...(model === DEFAULT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          systemInstruction,
          tools: [{ functionDeclarations: [...READ_TOOLS, ...WRITE_TOOLS] }],
        },
      }),
    isEn
  );

  const functionCalls = response1.functionCalls;
  if (!functionCalls || functionCalls.length === 0) {
    return {
      assistantText: response1.text?.trim() || (isEn ? 'Unable to generate a response.' : 'Yanıt üretilemedi.'),
      pendingAction: null,
    };
  }

  const firstCall = functionCalls[0];
  const toolName = firstCall.name || '';
  const args = (firstCall.args as Record<string, unknown>) || {};

  if (WRITE_TOOL_NAMES.has(toolName)) {
    const pendingAction: PendingAiAction = {
      id: newId(),
      toolName,
      summary: summarizeProposedAction(toolName, args, isEn),
      args,
    };
    const intro =
      response1.text?.trim() ||
      (isEn
        ? `Awaiting your confirmation to perform this action: **${pendingAction.summary}**. You can confirm or cancel using the card below.`
        : `Bu işlemi gerçekleştirmek için onayınızı bekliyorum: **${pendingAction.summary}**. Aşağıdaki karttan onaylayabilir veya iptal edebilirsiniz.`);
    return {
      assistantText: intro,
      pendingAction,
    };
  }

  let toolResult: unknown = {};
  if (toolName === 'getWorkspaceSummary') {
    toolResult = JSON.parse(buildWorkspaceContext(userId));
  } else if (toolName === 'findInactiveProjects') {
    toolResult = computeControlSummary(userId);
  }

  const previousContent = response1.candidates?.[0]?.content;
  if (!previousContent) {
    return {
      assistantText: response1.text?.trim() || (isEn ? 'Analysis complete.' : 'Analiz tamamlandı.'),
      pendingAction: null,
    };
  }

  const response2 = await generateWithFallback(
    (model, abortSignal) =>
      ai.models.generateContent({
        model,
        contents: [
          ...contents,
          previousContent,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: firstCall.id,
                  name: toolName,
                  response: { result: toolResult },
                },
              },
            ],
          },
        ],
        config: {
          abortSignal,
          ...(model === DEFAULT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          systemInstruction,
        },
      }),
    isEn
  );

  return {
    assistantText: response2.text?.trim() || (isEn ? 'Analysis complete.' : 'Analiz tamamlandı.'),
    pendingAction: null,
  };
}

export function executeConfirmedAiAction(userId: string, action: PendingAiAction): string {
  const args = action.args || {};
  const now = nowIso();
  const isEn = String(ensureUserSettings(userId).language || '').toLowerCase().startsWith('en');

  switch (action.toolName) {
    case 'createProject': {
      const id = newId();
      const name = String(args.name || '').trim();
      if (!name) throw new Error(isEn ? 'Project name cannot be empty.' : 'Proje adı boş olamaz.');
      const allowedStatuses = new Set([
        'Fikir',
        'Araştırma',
        'Planlama',
        'Geliştirme',
        'Test',
        'Yayınlandı',
        'Beklemede',
        'Donduruldu',
        'İptal Edildi',
      ]);
      const status = allowedStatuses.has(String(args.status)) ? String(args.status) : 'Planlama';
      const priority = ['Düşük', 'Orta', 'Yüksek', 'Kritik'].includes(String(args.priority))
        ? String(args.priority)
        : 'Orta';
      const deadline = args.deadline ? String(args.deadline).slice(0, 10) : null;

      db.prepare(
        `INSERT INTO projects (id, user_id, name, description, category, priority, status, start_date, deadline, progress, tags, last_activity_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?)`
      ).run(
        id,
        userId,
        name,
        String(args.description || ''),
        String(args.category || (isEn ? 'General' : 'Genel')),
        priority,
        status,
        now.slice(0, 10),
        deadline,
        now,
        now,
        now
      );
      logActivity(
        userId,
        'project',
        id,
        name,
        isEn ? 'Project created' : 'Proje oluşturuldu',
        isEn ? 'AI assistant suggestion approved' : 'Yapay zeka asistanı önerisi onaylandı'
      );
      return isEn ? `Project "${name}" was successfully created.` : `"${name}" projesi başarıyla oluşturuldu.`;
    }

    case 'createTask': {
      const id = newId();
      const title = String(args.title || '').trim();
      if (!title) throw new Error(isEn ? 'Task title cannot be empty.' : 'Görev başlığı boş olamaz.');
      let projectId: string | null = args.project_id ? String(args.project_id) : null;
      if (projectId) {
        const exists = db.prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`).get(projectId, userId);
        if (!exists) projectId = null;
      }
      const priority = ['Düşük', 'Orta', 'Yüksek', 'Kritik'].includes(String(args.priority))
        ? String(args.priority)
        : 'Orta';
      const dueDate = args.due_date ? String(args.due_date).slice(0, 10) : null;
      const estimated = Math.max(0, Number(args.estimated_minutes || 0));

      db.prepare(
        `INSERT INTO tasks (id, user_id, project_id, title, description, priority, status, start_date, due_date, estimated_minutes, actual_minutes, tags, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Yapılacak', ?, ?, ?, 0, '[]', '', ?, ?)`
      ).run(id, userId, projectId, title, String(args.description || ''), priority, now.slice(0, 10), dueDate, estimated, now, now);

      touchProjectActivity(userId, projectId);
      recalculateProjectProgress(userId, projectId);
      logActivity(
        userId,
        'task',
        id,
        title,
        isEn ? 'Task created' : 'Görev oluşturuldu',
        isEn ? 'Added via AI assistant' : 'Yapay zeka asistanı üzerinden eklendi'
      );
      return isEn ? `Task "${title}" was created.` : `"${title}" görevi oluşturuldu.`;
    }

    case 'updateTaskStatus': {
      const taskId = String(args.task_id || '');
      const status = String(args.status || '');
      if (!['Yapılacak', 'Devam Ediyor', 'İncelemede', 'Tamamlandı'].includes(status)) {
        throw new Error(isEn ? 'Invalid task status.' : 'Geçersiz görev durumu.');
      }
      const task = db
        .prepare(`SELECT id, title, project_id FROM tasks WHERE id = ? AND user_id = ?`)
        .get(taskId, userId) as { id: string; title: string; project_id: string | null } | undefined;
      if (!task) throw new Error(isEn ? 'Task to update was not found.' : 'Güncellenecek görev bulunamadı.');

      const completedAt = status === 'Tamamlandı' ? now : null;
      db.prepare(`UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
        status,
        completedAt,
        now,
        taskId,
        userId
      );
      touchProjectActivity(userId, task.project_id);
      recalculateProjectProgress(userId, task.project_id);
      logActivity(
        userId,
        'task',
        task.id,
        task.title,
        status === 'Tamamlandı'
          ? isEn
            ? 'Task completed'
            : 'Görev tamamlandı'
          : isEn
            ? 'Task status updated'
            : 'Görev durumu güncellendi',
        isEn ? `New status: ${status}` : `Yeni durum: ${status}`
      );
      return isEn
        ? `Task "${task.title}" status updated to "${status}".`
        : `"${task.title}" görevinin durumu "${status}" olarak güncellendi.`;
    }

    case 'createMilestone': {
      const projectId = String(args.project_id || '');
      const title = String(args.title || '').trim();
      const project = db
        .prepare(`SELECT id, name FROM projects WHERE id = ? AND user_id = ?`)
        .get(projectId, userId) as { id: string; name: string } | undefined;
      if (!project)
        throw new Error(isEn ? 'Project for milestone was not found.' : 'Kilometre taşı eklenecek proje bulunamadı.');
      if (!title) throw new Error(isEn ? 'Milestone title cannot be empty.' : 'Kilometre taşı başlığı boş olamaz.');
      const id = newId();
      const dueDate = args.due_date ? String(args.due_date).slice(0, 10) : null;
      db.prepare(
        `INSERT INTO milestones (id, user_id, project_id, title, description, due_date, is_completed, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', ?, 0, ?, ?)`
      ).run(id, userId, projectId, title, dueDate, now, now);
      touchProjectActivity(userId, projectId);
      logActivity(
        userId,
        'milestone',
        id,
        title,
        isEn ? 'Milestone added' : 'Kilometre taşı eklendi',
        `${isEn ? 'Project' : 'Proje'}: ${project.name}`
      );
      return isEn
        ? `Milestone "${title}" added to "${project.name}".`
        : `"${project.name}" projesine "${title}" kilometre taşı eklendi.`;
    }

    case 'createIdea': {
      const id = newId();
      const title = String(args.title || '').trim();
      if (!title) throw new Error(isEn ? 'Idea title cannot be empty.' : 'Fikir başlığı boş olamaz.');
      const potential = Math.min(5, Math.max(1, Number(args.potential || 3)));
      const difficulty = ['Kolay', 'Orta', 'Zor', 'Çok Zor'].includes(String(args.estimated_difficulty))
        ? String(args.estimated_difficulty)
        : 'Orta';
      db.prepare(
        `INSERT INTO ideas (id, user_id, title, description, category, potential, estimated_difficulty, priority, tags, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Orta', '[]', '', ?, ?)`
      ).run(
        id,
        userId,
        title,
        String(args.description || ''),
        String(args.category || (isEn ? 'Product' : 'Ürün')),
        potential,
        difficulty,
        now,
        now
      );
      logActivity(
        userId,
        'idea',
        id,
        title,
        isEn ? 'Idea created' : 'Fikir oluşturuldu',
        isEn ? 'Added to Idea Pool via AI assistant' : 'Yapay zeka asistanı üzerinden havuza eklendi'
      );
      return isEn ? `Idea "${title}" was added to the Idea Pool.` : `"${title}" fikri Fikir Havuzuna eklendi.`;
    }

    case 'createReminder': {
      const id = newId();
      const title = String(args.title || '').trim();
      const remindAt = String(args.remind_at || now);
      if (!title) throw new Error(isEn ? 'Reminder title cannot be empty.' : 'Hatırlatıcı başlığı boş olamaz.');
      db.prepare(
        `INSERT INTO reminders (id, user_id, title, description, remind_at, is_completed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(id, userId, title, String(args.description || ''), remindAt, now, now);
      logActivity(userId, 'reminder', id, title, isEn ? 'Reminder created' : 'Hatırlatıcı oluşturuldu', remindAt);
      return isEn ? `Reminder "${title}" was created.` : `"${title}" hatırlatıcısı oluşturuldu.`;
    }

    default:
      throw new Error(isEn ? `Unsupported action type: ${action.toolName}` : `Desteklenmeyen işlem türü: ${action.toolName}`);
  }
}

export async function generateDailyOverview(userId: string): Promise<string> {
  const ai = getGeminiClient();
  const isEn = String(ensureUserSettings(userId).language || '').toLowerCase().startsWith('en');
  const context = buildWorkspaceContext(userId);
  const response = await generateWithFallback(
    (model, abortSignal) =>
      ai.models.generateContent({
        model,
        contents: isEn
          ? `Analyze the current workspace data below and prepare a concise, clear, high-impact daily briefing in English for the Noah Command Center user.
Must cover:
1) Top 3 critical focuses for today
2) Overdue or at-risk items (if any)
3) Project focus limit status and recommended next action.
Keep it under 180 words.

DATA:
${context}`
          : `Aşağıdaki güncel çalışma alanı verilerini analiz et ve Noah Command Center kullanıcısı için kısa, net, yüksek etkili bir Türkçe günlük özet hazırla.
Şunları mutlaka kapsa:
1) Bugünün en kritik 3 odağı
2) Geciken veya risk altındaki işler (varsa)
3) Proje kontrol limiti ve sonraki adım tavsiyesi.
En fazla 180 kelime kullan.

VERİ:
${context}`,
        config: {
          abortSignal,
          systemInstruction: isEn
            ? 'You are a senior English-speaking personal productivity and project command assistant. Rely strictly on the provided real workspace data.'
            : 'Sen Türkçe konuşan kıdemli bir kişisel verimlilik ve proje komuta asistanısın. Yalnızca verilen gerçek verilere dayan.',
        },
      }),
    isEn
  );
  return response.text?.trim() || (isEn ? 'Could not generate daily overview.' : 'Günlük özet oluşturulamadı.');
}

export async function generateWeeklyReview(userId: string): Promise<string> {
  const ai = getGeminiClient();
  const isEn = String(ensureUserSettings(userId).language || '').toLowerCase().startsWith('en');
  const context = buildWorkspaceContext(userId);
  const projectsCount = (db.prepare(`SELECT COUNT(*) as c FROM projects WHERE user_id = ? AND is_archived = 0`).get(userId) as { c: number }).c;
  const completedWeek = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM tasks
         WHERE user_id = ? AND status = 'Tamamlandı' AND completed_at >= datetime('now', '-7 days')`
      )
      .get(userId) as { c: number }
  ).c;

  const response = await generateWithFallback(
    (model, abortSignal) =>
      ai.models.generateContent({
        model,
        contents: isEn
          ? `Write a comprehensive "Weekly AI Project Review" report evaluating the user's last 7 days of performance and all active projects.
Stats summary: Total active/non-archived projects: ${projectsCount}, tasks completed in the last 7 days: ${completedWeek}.
Include these sections:
1. Overall Progress Assessment
2. Completed Work & Momentum
3. Overdue Tasks & Bottlenecks
4. Inactive or At-Risk Projects
5. Upcoming Deadlines
6. Priority Action Plan for Next Week

WORKSPACE DATA:
${context}`
          : `Kullanıcının son 7 günlük performansını ve tüm aktif projelerini değerlendiren kapsamlı bir "Haftalık Yapay Zeka Proje Değerlendirmesi" raporu yaz.
İstatistik özeti: Toplam aktif/arşivsiz proje: ${projectsCount}, son 7 günde tamamlanan görev: ${completedWeek}.
Raporda şu bölümler yer alsın:
1. Genel İlerleme Değerlendirmesi
2. Tamamlanan İşler ve İvme
3. Geciken Görevler ve Darboğazlar
4. Pasif Kalan veya Riskli Projeler
5. Yaklaşan Son Tarihler
6. Önümüzdeki Hafta İçin Öncelikli Eylem Planı

ÇALIŞMA ALANI VERİSİ:
${context}`,
        config: {
          abortSignal,
          systemInstruction: isEn
            ? 'You are the Noah Command Center weekly project control and strategy advisor. Always reply in English.'
            : 'Sen Noah Command Center haftalık proje kontrol ve strateji danışmanısın. Yalnızca Türkçe yanıt ver.',
        },
      }),
    isEn
  );

  void parseTags;
  return response.text?.trim() || (isEn ? 'Could not generate weekly review.' : 'Haftalık değerlendirme oluşturulamadı.');
}
