'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, AlertCircle, ExternalLink, ShieldCheck, Loader2 } from 'lucide-react';
import { ChatMessage, Citation } from '@/types/chat';
import { DocumentChunk } from '@/types/document';
import { getSessionApiKey } from '../settings/ApiKeyModal';
import { LEGAL_DISCLAIMER } from '@/lib/constants';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';
import { DisclaimerBanner } from '../layout/DisclaimerBanner';

interface ChatInterfaceProps {
  chunks: DocumentChunk[];
  rawText: string;
  onJumpToCitation?: (sectionTitle: string, quote: string) => void;
  suggestedQuestions?: string[];
  initialInput?: string;
}

export function ChatInterface({
  chunks,
  rawText,
  onJumpToCitation,
  suggestedQuestions = [
    'What are my termination notice requirements?',
    'Does this agreement automatically renew?',
    'What penalties or late fees are specified?',
    'What are my indemnification and liability caps?',
  ],
  initialInput = '',
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: "Hello! I am your LegalLens assistant. You can ask me specific questions about this document's commitments, deadlines, liabilities, or termination rules. I will cite the exact section for every answer.",
      citations: [],
      timestamp: new Date().toISOString(),
      disclaimer: LEGAL_DISCLAIMER,
    },
  ]);
  const [inputQuery, setInputQuery] = useState(initialInput);
  const [isLoading, setIsLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialInput) {
      setInputQuery(initialInput);
    }
  }, [initialInput]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (queryToSend?: string) => {
    const query = (queryToSend || inputQuery).trim();
    if (!query || isLoading) return;

    setInputQuery('');
    setChatError(null);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      citations: [],
      timestamp: new Date().toISOString(),
      disclaimer: LEGAL_DISCLAIMER,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const customApiKey = getSessionApiKey();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (customApiKey) {
        headers['x-nvidia-api-key'] = customApiKey;
        headers['x-openrouter-api-key'] = customApiKey;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: query,
          chunks,
          rawText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to get answer.');
      }

      setMessages((prev) => [...prev, data]);
    } catch (err: unknown) {
      const msg = getUserSafeErrorMessage(
        err,
        'Something went wrong answering your question — please try again.'
      );
      setChatError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: `Error: ${msg}`,
          citations: [],
          timestamp: new Date().toISOString(),
          isOutOfScope: true,
          disclaimer: LEGAL_DISCLAIMER,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-none">Document Q&A</h3>
            <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Scoped exclusively to uploaded document
            </span>
          </div>
        </div>

        <span className="text-xs text-slate-400">Strict citations enabled</span>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-xs shadow-xs'
                  : 'bg-slate-50 border border-slate-200/80 text-slate-800 rounded-tl-xs'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Citations List */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Source Citations:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((citation, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          onJumpToCitation &&
                          onJumpToCitation(citation.sectionTitle, citation.quote)
                        }
                        title={`Jump to: ${citation.quote}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 transition-colors shadow-2xs"
                      >
                        <span>{citation.sectionTitle}</span>
                        <ExternalLink className="w-3 h-3 text-indigo-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual AI Response Disclaimer */}
              {msg.sender === 'assistant' && (
                <DisclaimerBanner
                  inline
                  text={msg.disclaimer || LEGAL_DISCLAIMER}
                  className="mt-2.5 pt-2 border-t border-slate-200/70"
                />
              )}
            </div>

            {msg.sender === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Scanning document chunks & verifying source citations...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1">
          <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500" /> Suggested:
          </span>
          {suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSendMessage(q)}
              className="px-2.5 py-1 rounded-full bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 text-xs font-medium whitespace-nowrap transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2"
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Ask anything about obligations, penalties, notice periods..."
          disabled={isLoading}
          className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none placeholder:text-slate-400 text-slate-900"
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || isLoading}
          aria-label="Send question"
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
