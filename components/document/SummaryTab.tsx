'use client';

import React from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { DocumentSection, DocumentSummary } from '@/types/document';
import { SectionSummaryCard } from '../summary/SectionSummaryCard';
import { DisclaimerBanner } from '../layout/DisclaimerBanner';

export interface SummaryTabProps {
  summary: DocumentSummary | undefined;
  sections: DocumentSection[];
  summaryLoading: boolean;
  summaryError: string | null;
  onRetrySummary: () => void;
  onJumpToSource: (sectionId: string) => void;
}

export function SummaryTab({
  summary,
  sections,
  summaryLoading,
  summaryError,
  onRetrySummary,
  onJumpToSource,
}: SummaryTabProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
      {/* Scoped Summary Error Banner with Retry (never show if summary successfully rendered) */}
      {summaryError && !summary && (
        <div
          role="alert"
          className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{summaryError}</span>
          </div>
          <button
            onClick={onRetrySummary}
            disabled={summaryLoading}
            className="px-3 py-1.5 rounded-lg bg-amber-200/80 hover:bg-amber-300 font-semibold text-amber-950 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {summaryLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Retry Plain Summary</span>
          </button>
        </div>
      )}

      {summaryLoading && !summary ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
          <h3 className="text-base font-bold text-slate-900">
            Generating Plain-Language Summary...
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Translating legal terms into plain English and distilling key commitments.
          </p>
        </div>
      ) : (
        <>
          {/* Executive Overview Card */}
          {summary && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold uppercase font-mono">
                  {summary.documentType || 'Agreement'}
                </span>
                {summary.effectiveDateOrTerm && (
                  <span className="text-xs text-slate-500">
                    &bull; Term: {summary.effectiveDateOrTerm}
                  </span>
                )}
              </div>

              <h2 className="text-lg font-bold text-slate-900">
                Executive Overview
              </h2>

              <p className="text-sm text-slate-700 leading-relaxed">
                {summary.overview}
              </p>

              {summary.keyTakeaways && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Summary Takeaways:
                  </h4>
                  <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700">
                    {summary.keyTakeaways.map((takeaway, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Section Summaries */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 px-1">
              Section-by-Section Explanations
            </h3>
            {sections.map((section) => (
              <SectionSummaryCard
                key={section.id}
                section={section}
                onJumpToSource={onJumpToSource}
              />
            ))}

            <div className="pt-2">
              <DisclaimerBanner compact />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
