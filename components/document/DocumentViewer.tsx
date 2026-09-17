'use client';

import React, { useEffect, useRef } from 'react';
import { FileText, Eye, AlertOctagon, AlertTriangle, CheckCircle, Hash } from 'lucide-react';
import { DocumentSection } from '@/types/document';

interface DocumentViewerProps {
  sections: DocumentSection[];
  activeSectionId?: string;
  onSelectSection?: (sectionId: string) => void;
  highlightedQuote?: string | null;
}

export function DocumentViewer({
  sections,
  activeSectionId,
  onSelectSection,
  highlightedQuote,
}: DocumentViewerProps) {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (activeSectionId && sectionRefs.current[activeSectionId]) {
      sectionRefs.current[activeSectionId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [activeSectionId]);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-800">Original Document Text</h2>
        </div>
        <span className="text-xs text-slate-500">
          {sections.length} section{sections.length === 1 ? '' : 's'} identified
        </span>
      </div>

      {/* Sections List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {sections.map((section, idx) => {
          const isSelected = activeSectionId === section.id;
          const flags = section.flagCount;

          return (
            <div
              key={section.id}
              id={`doc-${section.id}`}
              ref={(el) => {
                sectionRefs.current[section.id] = el;
              }}
              className={`p-4 sm:p-5 rounded-xl border transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-200 shadow-xs'
                  : 'border-slate-200 bg-slate-50/30 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                    {section.sectionNumber || `§ ${idx + 1}`}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    {section.title}
                  </h3>
                </div>

                {/* Flags indicator */}
                {flags && (flags.high > 0 || flags.medium > 0 || flags.low > 0) && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {flags.high > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold">
                        <AlertOctagon className="w-3 h-3" /> {flags.high}
                      </span>
                    )}
                    {flags.medium > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                        <AlertTriangle className="w-3 h-3" /> {flags.medium}
                      </span>
                    )}
                    {flags.low > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                        <CheckCircle className="w-3 h-3" /> {flags.low}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Text content with potential highlight */}
              <div className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap font-serif">
                {highlightedQuote && section.originalText.includes(highlightedQuote) ? (
                  <HighlightedText text={section.originalText} query={highlightedQuote} />
                ) : (
                  section.originalText
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(query);

  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <mark className="bg-amber-200 text-slate-950 font-medium px-1 rounded">
              {query}
            </mark>
          )}
        </React.Fragment>
      ))}
    </>
  );
}
