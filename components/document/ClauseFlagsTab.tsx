'use client';

import React from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { ClauseItem } from '@/types/clause';
import { ClausePanel } from '../clauses/ClausePanel';

export interface ClauseFlagsTabProps {
  clauses: ClauseItem[];
  clausesLoading: boolean;
  clausesError: string | null;
  onRetryClauses: () => void;
  onJumpToClause: (sectionTitle: string, quote: string) => void;
  onAskAboutClause: (clause: ClauseItem) => void;
}

export function ClauseFlagsTab({
  clauses,
  clausesLoading,
  clausesError,
  onRetryClauses,
  onJumpToClause,
  onAskAboutClause,
}: ClauseFlagsTabProps) {
  return (
    <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
      {/* Scoped Clauses Error Banner with Retry (never show if clauses successfully rendered) */}
      {clausesError && clauses.length === 0 && (
        <div
          role="alert"
          className="mb-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between shadow-2xs shrink-0"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{clausesError}</span>
          </div>
          <button
            onClick={onRetryClauses}
            disabled={clausesLoading}
            className="px-3 py-1.5 rounded-lg bg-amber-200/80 hover:bg-amber-300 font-semibold text-amber-950 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {clausesLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Retry Attention Flags</span>
          </button>
        </div>
      )}

      {clausesLoading && clauses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
          <h3 className="text-base font-bold text-slate-900">
            Scanning Clauses & Flagging Attention Areas...
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Checking obligations, deadlines, penalties, auto-renewals, liabilities, and termination terms.
          </p>
        </div>
      ) : (
        <ClausePanel
          clauses={clauses}
          onJumpToClause={onJumpToClause}
          onAskAboutClause={onAskAboutClause}
        />
      )}
    </div>
  );
}
