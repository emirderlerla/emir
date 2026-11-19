import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  FileBarChart2,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import type { AiConversation, AiMessage } from '../types';
import { formatDateTimeTr } from '../utils/format';

interface AiAssistantPageProps {
  onDataChanged: () => void;
}

const QUICK_PROMPTS_TR = [
  'Tüm projelerimi özetle ve mevcut ilerlemeyi analiz et.',
  'Geciken projeleri ve darboğazları tespit et, sıradaki en kritik görevi öner.',
  'Aktif odak projelerimi kontrol et; pasif kalan proje var mı?',
  'Fikir havuzumdaki fikirleri değerlendirip hangisinin projeye dönüşmesi gerektiğini söyle.',
  'Haftalık verimlilik raporu oluştur.',
];

const QUICK_PROMPTS_EN = [
  'Summarize all my projects and analyze current progress.',
  'Identify overdue projects and bottlenecks, and suggest the next critical task.',
  'Review my active focus projects; are any projects inactive?',
  'Evaluate ideas in my Idea Pool and recommend which one should become a project.',
  'Generate a weekly productivity report.',
];

export function AiAssistantPage({ onDataChanged }: AiAssistantPageProps) {
  const { showToast } = useToast();
  const { lang, isEn, l } = useI18n();
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const skipNextFetchConvIdRef = useRef<string | null>(null);

  const quickPrompts = isEn ? QUICK_PROMPTS_EN : QUICK_PROMPTS_TR;

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiRequest<{ conversations?: AiConversation[] }>('/api/ai/conversations');
      const list = Array.isArray(res.conversations)
        ? res.conversations.filter((c): c is AiConversation => Boolean(c && c.id))
        : [];
      setConversations(list);
      if (!activeConvId && list.length > 0) {
        setActiveConvId(list[0].id);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Sohbet geçmişi alınamadı.', 'Could not load chat history.'),
        'error'
      );
    }
  }, [activeConvId, showToast, l]);

  const loadMessages = useCallback(
    async (convId: string) => {
      try {
        const res = await apiRequest<{ messages?: AiMessage[] }>(`/api/ai/conversations/${convId}/messages`);
        setMessages(
          Array.isArray(res.messages) ? res.messages.filter((m): m is AiMessage => Boolean(m && m.role)) : []
        );
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : l('Mesajlar yüklenemedi.', 'Could not load messages.'),
          'error'
        );
      }
    },
    [showToast, l]
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeConvId) {
      if (skipNextFetchConvIdRef.current === activeConvId) {
        skipNextFetchConvIdRef.current = null;
        return;
      }
      loadMessages(activeConvId);
    } else {
      setMessages([]);
    }
  }, [activeConvId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleNewConversation = async () => {
    try {
      const res = await apiRequest<{ conversation?: AiConversation }>('/api/ai/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: l('Yeni Sohbet', 'New Chat') }),
      });
      if (res.conversation?.id) {
        const created = res.conversation;
        setConversations((prev) => [created, ...prev.filter((c): c is AiConversation => Boolean(c && c.id))]);
        setActiveConvId(created.id);
        setMessages([]);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Yeni sohbet başlatılamadı.', 'Could not start a new chat.'),
        'error'
      );
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await apiRequest(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      const next = conversations.filter((c) => c.id !== id);
      setConversations(next);
      if (activeConvId === id) {
        setActiveConvId(next[0]?.id ?? null);
      }
      showToast(l('Sohbet silindi.', 'Chat deleted.'));
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Sohbet silinemedi.', 'Could not delete chat.'),
        'error'
      );
    }
  };

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || sending) return;
    if (!textToSend) setInput('');
    setChatError(null);
    setLastFailedMessage(null);

    const tempId = `temp-user-${Date.now()}`;
    const optimisticMsg: AiMessage = {
      id: tempId,
      user_id: '',
      conversation_id: activeConvId || 'pending',
      role: 'user',
      content: text,
      pending_action: null,
      action_status: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev.filter((m): m is AiMessage => Boolean(m && m.role)), optimisticMsg]);
    setSending(true);
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 45000);
      let res: {
        conversationId?: string;
        userMessage?: AiMessage;
        assistantMessage?: AiMessage;
      };
      try {
        res = await apiRequest<{
          conversationId?: string;
          userMessage?: AiMessage;
          assistantMessage?: AiMessage;
        }>('/api/ai/chat', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            conversationId: activeConvId || undefined,
            message: text,
          }),
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      const incoming = [res.userMessage, res.assistantMessage].filter(
        (m): m is AiMessage => Boolean(m && m.role)
      );
      if (res.conversationId && !activeConvId) {
        skipNextFetchConvIdRef.current = res.conversationId;
        setActiveConvId(res.conversationId);
      }
      loadConversations();
      if (incoming.length > 0) {
        setMessages((prev) => [
          ...prev.filter((m): m is AiMessage => Boolean(m && m.role && m.id !== tempId)),
          ...incoming,
        ]);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m): m is AiMessage => Boolean(m && m.role && m.id !== tempId)));
      if (!textToSend) setInput(text);
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const errMessage = isAbort
        ? l('Yanıt süresi zaman aşımına uğradı. Lütfen tekrar deneyin.', 'Response timed out. Please try again.')
        : err instanceof Error
          ? err.message
          : l('Yapay zeka yanıtı alınamadı.', 'Could not get AI response.');
      setChatError(errMessage);
      setLastFailedMessage(text);
      showToast(errMessage, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleConfirmAction = async (messageId: string, decision: 'confirm' | 'cancel') => {
    setConfirmingId(messageId);
    try {
      const res = await apiRequest<{ status: string; message: string }>('/api/ai/confirm-action', {
        method: 'POST',
        body: JSON.stringify({ messageId, decision }),
      });
      showToast(res.message, decision === 'confirm' ? 'success' : 'info');
      if (activeConvId) await loadMessages(activeConvId);
      if (decision === 'confirm') onDataChanged();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('İşlem onaylanamadı.', 'Could not confirm action.'),
        'error'
      );
    } finally {
      setConfirmingId(null);
    }
  };

  const handleWeeklyReview = async () => {
    setWeeklyLoading(true);
    try {
      const res = await apiRequest<{ review?: string }>('/api/ai/weekly-review', { method: 'POST' });
      let convId = activeConvId;
      if (!convId) {
        const created = await apiRequest<{ conversation?: AiConversation }>('/api/ai/conversations', {
          method: 'POST',
          body: JSON.stringify({
            title: l('Haftalık AI Proje Değerlendirmesi', 'Weekly AI Project Review'),
          }),
        });
        if (created.conversation?.id) {
          const conv = created.conversation;
          convId = conv.id;
          setConversations((prev) => [conv, ...prev.filter((c): c is AiConversation => Boolean(c && c.id))]);
          setActiveConvId(convId);
        }
      }
      if (res.review) {
        setMessages((prev) => [
          ...prev.filter((m): m is AiMessage => Boolean(m && m.role)),
          {
            id: `weekly-${Date.now()}`,
            user_id: '',
            conversation_id: convId || '',
            role: 'assistant',
            content: res.review || '',
            pending_action: null,
            action_status: null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Haftalık inceleme oluşturulamadı.', 'Could not generate weekly review.'),
        'error'
      );
    } finally {
      setWeeklyLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 lg:gap-5 lg:h-[calc(100vh-8.5rem)] lg:min-h-[540px]">
      {/* Conversations Sidebar */}
      <div className="max-h-52 lg:max-h-none rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-4 flex flex-col overflow-hidden">
        <div className="space-y-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={handleNewConversation}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            {l('Yeni Sohbet Başlat', 'Start New Chat')}
          </button>
          <button
            type="button"
            onClick={handleWeeklyReview}
            disabled={weeklyLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-xl border border-[#38BDF8]/40 text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-colors disabled:opacity-60"
          >
            <FileBarChart2 className="w-4 h-4" />
            {weeklyLoading
              ? l('Rapor Hazırlanıyor...', 'Generating Report...')
              : l('Haftalık AI Değerlendirmesi', 'Weekly AI Review')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pt-3 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">
              {l('Henüz kayıtlı sohbet yok.', 'No saved chats yet.')}
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                  activeConvId === conv.id
                    ? 'bg-[#38BDF8]/12 text-[#2563EB] dark:text-[#38BDF8]'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
                onClick={() => setActiveConvId(conv.id)}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{conv.title}</div>
                  <div className="text-[10px] opacity-70 font-mono tabular-nums">
                    {formatDateTimeTr(conv.updated_at, lang)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 transition-opacity"
                  title={l('Sohbeti Sil', 'Delete Chat')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Viewport */}
      <div className="h-[68vh] lg:h-auto lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#38BDF8]/10 text-[#38BDF8]">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{l('Noah Komuta Asistanı', 'Noah Command Assistant')}</h2>
              <p className="text-[11px] text-slate-500">
                {l(
                  'Her konuda sohbet edebilir; projeleriniz, görevleriniz ve fikirleriniz için destek alabilirsiniz',
                  'Chat about anything or get strategic help across your projects, tasks, and ideas'
                )}
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            {l('Yazma İşlemleri Onay Korumalı', 'Write Actions Require Confirmation')}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-[#38BDF8]/10 text-[#38BDF8] flex items-center justify-center">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-display font-semibold">
                  {l('Komuta Asistanına Sorun', 'Ask the Command Assistant')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {l(
                    'Projelerinizi özetleyebilir, görev önceliklendirmesi yapabilir, proje planı çıkarabilir ve onayınızla doğrudan yeni görev veya proje oluşturabilirim.',
                    'I can summarize your projects, prioritize tasks, draft project plans, and create new tasks or projects with your confirmation.'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {quickPrompts.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendMessage(q)}
                    className="text-left text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#38BDF8]/60 bg-slate-50 dark:bg-[#070B14] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages
              .filter((m): m is AiMessage => Boolean(m && typeof m === 'object' && m.role))
              .map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                        isUser
                          ? 'bg-[#2563EB] text-white'
                          : 'bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {msg.content}
                    </div>

                    {msg.pending_action && (
                      <div className="mt-2 max-w-[85%] rounded-xl border border-[#38BDF8]/40 bg-[#38BDF8]/8 p-3.5 space-y-2.5">
                        <div className="text-xs font-semibold text-[#38BDF8]">
                          {msg.action_status === 'pending'
                            ? l('Kullanıcı Onayı Gerekiyor', 'User Confirmation Required')
                            : msg.action_status === 'executed'
                              ? l('İşlem Onaylandı ve Uygulandı', 'Action Confirmed & Applied')
                              : l('İşlem İptal Edildi', 'Action Cancelled')}
                        </div>
                        <div className="text-xs text-slate-700 dark:text-slate-200">
                          {msg.pending_action.summary}
                        </div>
                        {msg.action_status === 'pending' && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={confirmingId === msg.id}
                              onClick={() => handleConfirmAction(msg.id, 'confirm')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {l('Onayla ve Uygula', 'Confirm & Apply')}
                            </button>
                            <button
                              type="button"
                              disabled={confirmingId === msg.id}
                              onClick={() => handleConfirmAction(msg.id, 'cancel')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                            >
                              <X className="w-3.5 h-3.5" />
                              {l('İptal Et', 'Cancel')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <span className="text-[10px] text-slate-500 font-mono tabular-nums mt-1 px-1">
                      {formatDateTimeTr(msg.created_at, lang)}
                    </span>
                  </div>
                );
              })
          )}
          {sending && (
            <div className="flex items-start">
              <div className="rounded-2xl px-4 py-3 text-xs bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800 text-slate-400">
                {l('Yanıt hazırlanıyor...', 'Preparing response...')}
              </div>
            </div>
          )}
          {chatError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
              <span>{chatError}</span>
              {lastFailedMessage && (
                <button
                  type="button"
                  onClick={() => sendMessage(lastFailedMessage)}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium shrink-0"
                >
                  {l('Tekrar Dene', 'Try Again')}
                </button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={l(
              'Herhangi bir soru sorun, sohbet edin veya projeleriniz için komut verin...',
              'Ask any question, chat, or give a command for your projects...'
            )}
            className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">{l('Gönder', 'Send')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
