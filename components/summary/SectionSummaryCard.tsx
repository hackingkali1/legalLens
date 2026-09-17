'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, CheckCircle2 } from 'lucide-react';
import { DocumentSection } from '@/types/document';

interface SectionSummaryCardProps {
  section: DocumentSection;
  onJumpToSource: (sectionId: string) => void;
  defaultExpanded?: boolean;
}

export function SectionSummaryCard({
  section,
  onJumpToSource,
  defaultExpanded = false,
}: SectionSummaryCardProps) {
  const [showOriginal, setShowOriginal] = useState(defaultExpanded);

  return (
    <article
      aria-labelledby={`heading-${section.id}`}
      className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-xs transition-shadow space-y-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-mono font-medium text-slate-500 uppercase tracking-wider">
            {section.sectionNumber || 'Section'}
          </span>
          <h4 id={`heading-${section.id}`} className="text-base font-bold text-slate-900">
            {section.title}
          </h4>
        </div>

        <button
          onClick={() => onJumpToSource(section.id)}
          aria-label={`Jump to original text of ${section.title}`}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-indigo-50 transition-colors focus-visible:ring-2 shrink-0"
        >
          <span>View in Document</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Plain Language Summary */}
      <div className="text-sm text-slate-700 leading-relaxed bg-slate-50/70 p-3.5 rounded-lg border border-slate-100">
        <p className="font-medium text-slate-900 mb-1 text-xs uppercase tracking-wide">
          Plain-English Explanation:
        </p>
        <p>{section.plainLanguageSummary || 'Standard clause.'}</p>
      </div>

      {/* Key Takeaways */}
      {section.keyPoints && section.keyPoints.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Key Commitments & Takeaways:
          </p>
          <ul className="space-y-1 text-sm text-slate-700">
            {section.keyPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expandable Original Text */}
      <div className="pt-2 border-t border-slate-100">
        <button
          onClick={() => setShowOriginal(!showOriginal)}
          aria-expanded={showOriginal}
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-900 py-1"
        >
          <span>{showOriginal ? 'Hide original contract text' : 'Show original contract text'}</span>
          {showOriginal ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showOriginal && (
          <div className="mt-2.5 p-3.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-serif text-slate-800 leading-relaxed whitespace-pre-wrap">
            {section.originalText}
          </div>
        )}
      </div>
    </article>
  );
}
