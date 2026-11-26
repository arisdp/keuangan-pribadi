import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
} from 'lucide-react';
import { CategoryBudget, Transaction } from '../types';
import { buildHistoricalAnomalyChatContext } from '../utils/anomalyDetection';

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citedCategories?: string[];
}

interface AnomalyHistoryChatBoxProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  onFilterCategoryInCleanup?: (category: string) => void;
}

export const AnomalyHistoryChatBox: React.FC<AnomalyHistoryChatBoxProps> = ({
  transactions,
  budgets,
  onFilterCategoryInCleanup,
}) => {
  const historyContext = useMemo(
    () => buildHistoricalAnomalyChatContext({ transactions, budgets }),
    [transactions, budgets]
  );

  const quickPrompts = useMemo(() => {
    const prompts: string[] = [];
    const topCategories = historyContext.categoryProfiles;

    if (topCategories.length > 0) {
      prompts.push(`Mengapa ${topCategories[0].category} sering anomali?`);
    }
    if (topCategories.length > 1) {
      prompts.push(
        `Apa pola transaksi pemicu lonjakan ${topCategories[1].category}?`
      );
    }
    if (historyContext.active7DayAlerts.length > 0) {
      prompts.push(
        `Mengapa frekuensi ${historyContext.active7DayAlerts[0].category} naik tajam 7 hari terakhir?`
      );
    } else {
      prompts.push('Kategori mana yang paling sering melonjak dalam 12 bulan terakhir?');
    }

    return Array.from(new Set(prompts)).slice(0, 3);
  }, [historyContext]);

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length > 0 || loading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, loading]);

  const sendQuestion = async (rawQuestion: string, skipAppendUser = false) => {
    const cleanQuestion = rawQuestion.trim();
    if (!cleanQuestion || loading) return;

    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const nextMessages: ChatMessageItem[] = skipAppendUser
      ? [...messages]
      : [
          ...messages,
          {
            id: `usr-${Date.now()}`,
            role: 'user',
            text: cleanQuestion,
            timestamp: nowTime,
          },
        ];

    if (!skipAppendUser) {
      setMessages(nextMessages);
      setInputValue('');
    }

    setLoading(true);
    setError(null);
    setLastFailedPrompt(null);

    try {
      const res = await fetch('/api/anomaly-history-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            text: m.text,
          })),
          historyContext,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          payload?.error || 'Gagal mendapatkan penjelasan historis dari AI.'
        );
      }

      const answerText = String(payload?.answer || '').trim();
      const citedCategories = Array.isArray(payload?.citedCategories)
        ? payload.citedCategories
        : [];
      const replyTimestamp = String(payload?.timestamp || nowTime);

      setMessages((prev) => [
        ...prev,
        {
          id: `ast-${Date.now()}`,
          role: 'assistant',
          text: answerText,
          timestamp: replyTimestamp,
          citedCategories,
        },
      ]);
    } catch (err: any) {
      setError(
        err?.message ||
          'Terjadi kendala saat menghubungi asisten analisis historis.'
      );
      setLastFailedPrompt(cleanQuestion);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(inputValue);
  };

  const handleResetChat = () => {
    setMessages([]);
    setError(null);
    setLastFailedPrompt(null);
  };

  const hasTransactionData = historyContext.totalExpenseTransactionsAnalyzed > 0;

  return (
    <section
      id="anomaly-history-chat-section"
      className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
    >
      {/* Minimalist Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white shrink-0">
            <MessageSquareText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Tanya Riwayat Anomali Kategori
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                · Basis data {historyContext.referencePeriod} ·{' '}
                <span className="font-mono tabular-nums">
                  {historyContext.totalExpenseTransactionsAnalyzed}
                </span>{' '}
                transaksi
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tanyakan alasan kategori tertentu sering melonjak untuk memperoleh penjelasan berbasis pola historis transaksi Anda.
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleResetChat}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/70 text-slate-600 dark:text-slate-300 transition cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 self-start sm:self-center"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Chat</span>
          </button>
        )}
      </div>

      {/* Quick Suggested Questions */}
      {hasTransactionData && quickPrompts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-0.5">
            Contoh pertanyaan:
          </span>
          {quickPrompts.map((promptText) => (
            <button
              key={promptText}
              type="button"
              disabled={loading}
              onClick={() => sendQuestion(promptText)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 transition cursor-pointer whitespace-nowrap shrink-0 max-w-full truncate"
            >
              {promptText}
            </button>
          ))}
        </div>
      )}

      {/* Conversation Thread */}
      {messages.length > 0 && (
        <div
          aria-live="polite"
          className="max-h-[300px] overflow-y-auto space-y-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30"
        >
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${
                  isUser ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[82%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-line ${
                    isUser
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <p>{msg.text}</p>

                  {!isUser &&
                    onFilterCategoryInCleanup &&
                    msg.citedCategories &&
                    msg.citedCategories.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          Lihat di Smart Cleanup:
                        </span>
                        {msg.citedCategories.map((catName) => (
                          <button
                            key={catName}
                            type="button"
                            onClick={() => onFilterCategoryInCleanup(catName)}
                            className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                          >
                            {catName} →
                          </button>
                        ))}
                      </div>
                    )}
                </div>

                <span className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500 px-1">
                  {isUser ? 'Anda' : 'Analis AI'} · {msg.timestamp}
                </span>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 px-1 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
              <span>Menelusuri histori transaksi &amp; pola lonjakan...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-start gap-2 text-rose-800 dark:text-rose-200">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          {lastFailedPrompt && (
            <button
              type="button"
              onClick={() => sendQuestion(lastFailedPrompt, true)}
              className="px-3 py-1.5 rounded-lg font-bold bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Kirim Ulang
            </button>
          )}
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={!hasTransactionData || loading}
          placeholder={
            hasTransactionData
              ? 'Tanyakan mis. "Mengapa kategori Makanan sering anomali?"'
              : 'Tambahkan catatan transaksi pengeluaran terlebih dahulu untuk bertanya...'
          }
          aria-label="Pertanyaan tentang riwayat anomali kategori"
          className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!hasTransactionData || loading || !inputValue.trim()}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          <span>Tanya AI</span>
        </button>
      </form>
    </section>
  );
};
