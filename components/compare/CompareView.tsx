'use client';

import React, { useState } from 'react';
import { GitCompare, ArrowRight, AlertOctagon, AlertTriangle, CheckCircle, Plus, Minus, RefreshCw, Loader2, Sparkles, FileText } from 'lucide-react';
import { DocumentDiffResult, MaterialChange } from '@/types/compare';
import { SAMPLE_NDA_V1_TEXT, SAMPLE_NDA_V2_TEXT } from '@/lib/fixtures/samples';
import { DisclaimerBanner } from '../layout/DisclaimerBanner';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';

export function CompareView() {
  const [docAName, setDocAName] = useState('Standard NDA (2025)');
  const [docAText, setDocAText] = useState(SAMPLE_NDA_V1_TEXT);

  const [docBName, setDocBName] = useState('Revised NDA (2026)');
  const [docBText, setDocBText] = useState(SAMPLE_NDA_V2_TEXT);

  const [isComparing, setIsComparing] = useState(false);
  const [diffResult, setDiffResult] = useState<DocumentDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunComparison = async () => {
    if (!docAText.trim() || !docBText.trim()) {
      setError('Please provide text for both Document A and Document B.');
      return;
    }

    setIsComparing(true);
    setError(null);

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          docAName: docAName.trim() || 'Document A',
          docAText,
          docBName: docBName.trim() || 'Document B',
          docBText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Comparison failed.');
      }

      setDiffResult(data);
    } catch (err: unknown) {
      const msg = getUserSafeErrorMessage(
        err,
        'Something went wrong comparing these documents — please try again.'
      );
      setError(msg);
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title & Introduction */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-2">
              <GitCompare className="w-3.5 h-3.5" />
              <span>Version Diff & Semantic Analysis</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Compare Two Contract Versions
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Inspect what materially changed between two versions of a contract, lease, or ToS. LegalLens highlights added, removed, and modified terms with plain-English legal explanations without recommending which version to choose.
            </p>
          </div>

          <button
            onClick={() => {
              setDocAName('Mutual NDA (v1)');
              setDocAText(SAMPLE_NDA_V1_TEXT);
              setDocBName('Mutual NDA (v2 Revised)');
              setDocBText(SAMPLE_NDA_V2_TEXT);
              setDiffResult(null);
            }}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Reset to Sample NDA Comparison
          </button>
        </div>
      </div>

      <DisclaimerBanner />

      {/* Document Inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document A */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-400" /> Version A (Base Document)
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {docAText.length} characters
            </span>
          </div>

          <input
            type="text"
            value={docAName}
            onChange={(e) => setDocAName(e.target.value)}
            placeholder="Document A Title (e.g. 2025 Original NDA)"
            className="w-full px-3.5 py-2 text-sm font-semibold rounded-lg border border-slate-200 focus:border-indigo-600 outline-none"
          />

          <textarea
            rows={10}
            value={docAText}
            onChange={(e) => setDocAText(e.target.value)}
            placeholder="Paste text of Document A here..."
            className="w-full p-3.5 text-xs font-mono rounded-lg border border-slate-200 bg-stone-50/50 text-slate-800 leading-relaxed outline-none focus:border-indigo-600 focus:bg-white"
          />
        </div>

        {/* Document B */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-400" /> Version B (Revised / Counter-proposal)
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {docBText.length} characters
            </span>
          </div>

          <input
            type="text"
            value={docBName}
            onChange={(e) => setDocBName(e.target.value)}
            placeholder="Document B Title (e.g. 2026 Counter-proposal)"
            className="w-full px-3.5 py-2 text-sm font-semibold rounded-lg border border-slate-200 focus:border-indigo-600 outline-none"
          />

          <textarea
            rows={10}
            value={docBText}
            onChange={(e) => setDocBText(e.target.value)}
            placeholder="Paste text of Document B here..."
            className="w-full p-3.5 text-xs font-mono rounded-lg border border-slate-200 bg-stone-50/50 text-slate-800 leading-relaxed outline-none focus:border-indigo-600 focus:bg-white"
          />
        </div>
      </div>

      {/* Compare Button */}
      <div className="flex flex-col items-center justify-center pt-2">
        <button
          onClick={handleRunComparison}
          disabled={isComparing || !docAText.trim() || !docBText.trim()}
          className="px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {isComparing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Analyzing Material Shifts...</span>
            </>
          ) : (
            <>
              <GitCompare className="w-5 h-5" />
              <span>Analyze Material Differences</span>
            </>
          )}
        </button>

        {error && (
          <p className="text-xs text-rose-600 mt-2 font-medium">
            {error}
          </p>
        )}
      </div>

      {/* Results Section */}
      {diffResult && (
        <section aria-label="Comparison Results" className="space-y-6 pt-6 border-t border-slate-200">
          {/* Overview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              Executive Summary of Changes
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              {diffResult.summaryOverview}
            </p>
            <p className="text-xs text-slate-400 mt-3 italic">
              Notice: LegalLens reports material shifts neutrally to help you understand differences. We do not advise or recommend which version you should select.
            </p>
          </div>

          {/* Material Changes List */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Detected Material Changes ({diffResult.materialChanges.length})</span>
            </h3>

            <div className="grid grid-cols-1 gap-4">
              {diffResult.materialChanges.map((change) => {
                const typeConfig = {
                  added: {
                    icon: <Plus className="w-4 h-4 text-emerald-600" />,
                    badge: 'bg-emerald-50 text-emerald-800 border-emerald-300',
                    label: 'Added in Doc B',
                  },
                  removed: {
                    icon: <Minus className="w-4 h-4 text-rose-600" />,
                    badge: 'bg-rose-50 text-rose-800 border-rose-300',
                    label: 'Removed in Doc B',
                  },
                  modified: {
                    icon: <RefreshCw className="w-4 h-4 text-amber-600" />,
                    badge: 'bg-amber-50 text-amber-800 border-amber-300',
                    label: 'Modified Terms',
                  },
                }[change.type];

                return (
                  <article
                    key={change.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${typeConfig.badge}`}
                        >
                          {typeConfig.icon}
                          {typeConfig.label}
                        </span>
                        <h4 className="text-base font-bold text-slate-900">
                          {change.title}
                        </h4>
                      </div>

                      <span className="text-xs uppercase font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {change.attentionLevel} attention
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <strong>Plain-English Meaning: </strong>
                      {change.plainLanguageExplanation}
                    </p>

                    {/* Side by side excerpts */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs font-serif">
                      <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                        <span className="font-sans font-bold text-[11px] text-slate-500 uppercase block mb-1">
                          In {diffResult.docAName}: {change.sourceDocA?.sectionTitle || 'N/A'}
                        </span>
                        <p className="italic text-slate-700">
                          {change.sourceDocA?.quote ? `"${change.sourceDocA.quote}"` : 'Provision not present.'}
                        </p>
                      </div>

                      <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                        <span className="font-sans font-bold text-[11px] text-slate-500 uppercase block mb-1">
                          In {diffResult.docBName}: {change.sourceDocB?.sectionTitle || 'N/A'}
                        </span>
                        <p className="italic text-slate-700">
                          {change.sourceDocB?.quote ? `"${change.sourceDocB.quote}"` : 'Provision not present.'}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
