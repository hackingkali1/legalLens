'use client';

import React, { useState, useEffect } from 'react';
import { Download, FileDown, CheckSquare, X, ShieldAlert, Check, Copy, Loader2, Plus } from 'lucide-react';
import { LegalLensDocument } from '@/types/document';
import { LawyerChecklistItem } from '@/types/clause';
import { DisclaimerBanner } from '../layout/DisclaimerBanner';
import { Modal } from '@/components/ui/Modal';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';

interface LawyerChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: LegalLensDocument;
}

export function LawyerChecklistModal({
  isOpen,
  onClose,
  document,
}: LawyerChecklistModalProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<'pdf' | 'markdown' | null>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [items, setItems] = useState<LawyerChecklistItem[]>(document.lawyerChecklist || []);
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [customQuestionText, setCustomQuestionText] = useState('');

  useEffect(() => {
    if (document.lawyerChecklist) {
      setItems(document.lawyerChecklist);
    }
  }, [document.lawyerChecklist]);

  if (!isOpen) return null;

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleAddCustomQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestionText.trim()) return;

    const newItem: LawyerChecklistItem = {
      id: `custom-q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'question',
      text: customQuestionText.trim(),
      context: 'User-specified consultation inquiry',
      sourceSection: 'Custom Question',
    };

    setItems((prev) => [...prev, newItem]);
    setCustomQuestionText('');
  };

  const getExportDocument = (): LegalLensDocument => {
    return {
      ...document,
      lawyerChecklist: items,
    };
  };

  const handleDownload = async (format: 'pdf' | 'markdown') => {
    setDownloadingFormat(format);
    try {
      const exportDoc = getExportDocument();
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          document: exportDoc,
        }),
      });

      if (!res.ok) {
        throw new Error('Export failed.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `legallens_${document.fileName.replace(/\.[^/.]+$/, '')}.${
        format === 'markdown' ? 'md' : 'pdf'
      }`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      const safeMsg = getUserSafeErrorMessage(err, 'Failed to generate export file. Please try again.');
      alert(safeMsg);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleCopyMarkdown = async () => {
    try {
      const exportDoc = getExportDocument();
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'markdown',
          document: exportDoc,
        }),
      });
      const md = await res.text();
      await navigator.clipboard.writeText(md);
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const negotiations = items.filter((c) => c.type === 'negotiation');
  const questions = items.filter((c) => c.type === 'question');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="checklist-modal-title"
      className="w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shadow-2xs">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 id="checklist-modal-title" className="text-lg font-bold text-slate-900">
                Action Checklist & Lawyer Questions
              </h2>
              <p className="text-xs text-slate-500">
                {document.fileName} &bull; {items.length} action items
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close checklist modal"
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <DisclaimerBanner />

          {/* High Attention Items to Clarify/Negotiate */}
          {negotiations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  High-Attention Items to Clarify or Negotiate ({negotiations.length})
                </h3>
              </div>
              <div className="space-y-2.5">
                {negotiations.map((item) => {
                  const isChecked = !!checkedIds[item.id];
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 border rounded-xl text-sm flex items-start gap-3 transition-colors ${
                        isChecked
                          ? 'bg-slate-50 border-slate-200 text-slate-500'
                          : 'bg-rose-50/50 border-rose-200 text-rose-950'
                      }`}
                    >
                      <input
                        type="checkbox"
                        id={`checklist-${item.id}`}
                        checked={isChecked}
                        onChange={() => toggleItem(item.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                        aria-label={`Toggle ${item.text}`}
                      />
                      <label htmlFor={`checklist-${item.id}`} className="flex-1 cursor-pointer select-none">
                        <p className={`font-semibold mb-1 ${isChecked ? 'line-through text-slate-400' : ''}`}>
                          {item.text}
                        </p>
                        <p className={`text-xs ${isChecked ? 'text-slate-400' : 'text-rose-800'}`}>
                          <strong>Context:</strong> {item.context} | <strong>Source:</strong> {item.sourceSection}
                        </p>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Questions for Legal Consultation */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Questions to Ask an Attorney ({questions.length})
                </h3>
              </div>
            </div>

            {questions.length > 0 ? (
              <div className="space-y-2.5">
                {questions.map((item) => {
                  const isChecked = !!checkedIds[item.id];
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 border rounded-xl text-sm flex items-start gap-3 transition-colors ${
                        isChecked
                          ? 'bg-slate-50 border-slate-200 text-slate-500'
                          : 'bg-amber-50/50 border-amber-200 text-amber-950'
                      }`}
                    >
                      <input
                        type="checkbox"
                        id={`checklist-${item.id}`}
                        checked={isChecked}
                        onChange={() => toggleItem(item.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                        aria-label={`Toggle ${item.text}`}
                      />
                      <label htmlFor={`checklist-${item.id}`} className="flex-1 cursor-pointer select-none">
                        <p className={`font-semibold mb-1 ${isChecked ? 'line-through text-slate-400' : ''}`}>
                          {item.text}
                        </p>
                        <p className={`text-xs ${isChecked ? 'text-slate-400' : 'text-amber-800'}`}>
                          <strong>Context:</strong> {item.context} | <strong>Source:</strong> {item.sourceSection}
                        </p>
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No lawyer questions generated yet.</p>
            )}

            {/* Custom Question Form */}
            <form onSubmit={handleAddCustomQuestion} className="flex gap-2 pt-2">
              <input
                type="text"
                value={customQuestionText}
                onChange={(e) => setCustomQuestionText(e.target.value)}
                placeholder="Add a custom question to ask your attorney..."
                aria-label="Add custom question"
                className="flex-1 px-3.5 py-2 text-xs rounded-lg border border-slate-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!customQuestionText.trim()}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors shrink-0 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            </form>
          </div>

          {items.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              No specific risk flags required special lawyer inquiries for this document.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleCopyMarkdown}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
          >
            {copiedMarkdown ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                <span>Copy Full Report (Markdown)</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownload('markdown')}
              disabled={downloadingFormat !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
            >
              {downloadingFormat === 'markdown' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-slate-500" />
              )}
              Download .MD
            </button>

            <button
              onClick={() => handleDownload('pdf')}
              disabled={downloadingFormat !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
            >
              {downloadingFormat === 'pdf' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              Download PDF Report
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
