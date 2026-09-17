'use client';

import React, { useState } from 'react';
import { Filter, HelpCircle, ExternalLink, Quote, Sparkles, MessageSquare } from 'lucide-react';
import { ClauseItem, ClauseCategory, AttentionLevel } from '@/types/clause';
import { AttentionBadge } from './AttentionBadge';
import { DisclaimerBanner } from '../layout/DisclaimerBanner';

interface ClausePanelProps {
  clauses: ClauseItem[];
  onJumpToClause: (sectionTitle: string, quote: string) => void;
  onAskAboutClause?: (clause: ClauseItem) => void;
}

export function ClausePanel({
  clauses,
  onJumpToClause,
  onAskAboutClause,
}: ClausePanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAttention, setSelectedAttention] = useState<string>('all');

  const categories: { label: string; value: string }[] = [
    { label: 'All Categories', value: 'all' },
    { label: 'Obligations', value: 'obligations' },
    { label: 'Deadlines', value: 'deadlines' },
    { label: 'Penalties', value: 'penalties' },
    { label: 'Auto-Renewal', value: 'auto-renewal' },
    { label: 'Liability', value: 'liability' },
    { label: 'Indemnity', value: 'indemnity' },
    { label: 'Termination', value: 'termination' },
    { label: 'Other', value: 'other' },
  ];

  const filteredClauses = clauses.filter((c) => {
    const matchCategory = selectedCategory === 'all' || c.category === selectedCategory;
    const matchAttention = selectedAttention === 'all' || c.attentionLevel === selectedAttention;
    return matchCategory && matchAttention;
  });

  const highCount = clauses.filter((c) => c.attentionLevel === 'high').length;
  const medCount = clauses.filter((c) => c.attentionLevel === 'medium').length;
  const lowCount = clauses.filter((c) => c.attentionLevel === 'low').length;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Filter className="w-4 h-4 text-slate-400" />
            <span>Filter Attention Flags ({clauses.length} detected)</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => setSelectedAttention('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedAttention === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({clauses.length})
            </button>
            <button
              onClick={() => setSelectedAttention('high')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedAttention === 'high'
                  ? 'bg-rose-700 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              High ({highCount})
            </button>
            <button
              onClick={() => setSelectedAttention('medium')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedAttention === 'medium'
                  ? 'bg-amber-700 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Medium ({medCount})
            </button>
            <button
              onClick={() => setSelectedAttention('low')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedAttention === 'low'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Low ({lowCount})
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clause Cards List */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {filteredClauses.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            <HelpCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-medium">No clauses match the selected filters.</p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedAttention('all');
              }}
              className="mt-2 text-xs text-indigo-600 hover:underline"
            >
              Reset filters
            </button>
          </div>
        ) : (
          filteredClauses.map((clause) => (
            <article
              key={clause.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-slate-300 transition-all space-y-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AttentionBadge level={clause.attentionLevel} />
                    <span className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-500">
                      {clause.category}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900 tracking-tight">
                    {clause.title}
                  </h4>
                </div>

                <button
                  onClick={() => onJumpToClause(clause.sourceSection, clause.quote)}
                  aria-label={`View source of ${clause.title} in document`}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-indigo-50 transition-colors focus-visible:ring-2 shrink-0"
                >
                  <span>View Source</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Reason / Trigger */}
              <div className="text-xs text-slate-700 bg-slate-50 border-l-2 border-indigo-400 px-3 py-2 rounded-r-md">
                <strong className="text-slate-900">Attention Reason: </strong>
                {clause.reason}
              </div>

              {/* Plain Language Explanation */}
              <div className="text-sm text-slate-700 leading-relaxed">
                <p>{clause.plainLanguageExplanation}</p>
              </div>

              {/* Exact Quote */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs font-serif text-slate-800 leading-relaxed">
                <div className="flex items-center gap-1 text-[11px] font-sans uppercase font-bold text-slate-500 mb-1">
                  <Quote className="w-3 h-3 text-slate-400" />
                  <span>Excerpt from {clause.sourceSection}:</span>
                </div>
                <p className="italic">&ldquo;{clause.quote}&rdquo;</p>
              </div>

              {/* Recommended Question for Lawyer */}
              {clause.questionForLawyer && (
                <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-xs text-indigo-950 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-semibold block text-indigo-900">
                      Suggested question to clarify with an attorney:
                    </span>
                    <span>{clause.questionForLawyer}</span>
                  </div>
                  {onAskAboutClause && (
                    <button
                      onClick={() => onAskAboutClause(clause)}
                      title="Ask AI assistant about this clause"
                      aria-label="Ask AI assistant about this clause"
                      className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded focus-visible:ring-2"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </article>
          ))
        )}

        <DisclaimerBanner compact />
      </div>
    </div>
  );
}
