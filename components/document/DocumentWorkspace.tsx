'use client';

import React, { useState } from 'react';
import { ArrowLeft, RotateCw, CheckSquare } from 'lucide-react';
import { LegalLensDocument } from '@/types/document';
import { ClauseItem } from '@/types/clause';
import { DocumentViewer } from './DocumentViewer';
import { SummaryTab } from './SummaryTab';
import { ClauseFlagsTab } from './ClauseFlagsTab';
import { DocumentQATab } from './DocumentQATab';
import { LawyerChecklistModal } from '../export/LawyerChecklistModal';
import { DisclaimerBanner } from '../layout/DisclaimerBanner';
import { useDocumentAnalysis } from '@/hooks/useDocumentAnalysis';

interface DocumentWorkspaceProps {
  initialDocument: LegalLensDocument;
  onReset: () => void;
}

const TABS = [{ id: 'summary', label: 'Plain Summary' }, { id: 'clauses', label: 'Clause Attention Flags' }, { id: 'chat', label: 'Document Q&A' }] as const;

export function DocumentWorkspace({ initialDocument, onReset }: DocumentWorkspaceProps) {
  const {
    document, summaryLoading, summaryError, clausesLoading, clausesError,
    chatInitialQuery, setChatInitialQuery, runAnalysis,
  } = useDocumentAnalysis(initialDocument);

  const [activeTab, setActiveTab] = useState<'summary' | 'clauses' | 'chat' | 'original'>('summary');
  const [activeSectionId, setActiveSectionId] = useState<string>(initialDocument.sections[0]?.id || 'sec-1');
  const [highlightedQuote, setHighlightedQuote] = useState<string | null>(null);
  const [isChecklistOpen, setIsChecklistOpen] = useState<boolean>(false);

  const handleJumpToSource = (sectionId: string) => {
    setActiveSectionId(sectionId);
    setHighlightedQuote(null);
    if (window.innerWidth < 1024) setActiveTab('original');
  };
  const handleJumpToClauseSource = (sectionTitle: string, quote: string) => {
    const sTitle = sectionTitle.toLowerCase();
    const match = document.sections.find(
      (s) => s.title.toLowerCase().includes(sTitle) || sTitle.includes(s.title.toLowerCase()) || s.originalText.includes(quote)
    );
    if (match) setActiveSectionId(match.id);
    setHighlightedQuote(quote);
    if (window.innerWidth < 1024) setActiveTab('original');
  };
  const handleAskAboutClause = (clause: ClauseItem) => {
    setChatInitialQuery(`Please explain the risks and commitments of ${clause.title} from ${clause.sourceSection} in plain English.`);
    setActiveTab('chat');
  };

  const liveStatus = summaryLoading || clausesLoading ? 'Analyzing document...'
    : `${document.summary ? 'Summary ready. ' : ''}${document.clauses.length > 0 ? `${document.clauses.length} clause flags detected.` : ''}`;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-100">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveStatus}</div>

      {/* Top Workspace Action Bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <button onClick={onReset} className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors focus-visible:ring-2" aria-label="Back to document upload">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight truncate max-w-xs sm:max-w-md">{document.fileName}</h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase font-mono">{document.fileType}</span>
            </div>
            <p className="text-xs text-slate-500">
              {document.sections.length} sections &bull; {(document.fileSize / 1024).toFixed(1)} KB &bull; {document.clauses.length} attention flags detected
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => runAnalysis('all', true)} disabled={summaryLoading || clausesLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
            title="Bypass cache and re-analyze document with fresh LLM calls">
            <RotateCw className={`w-3.5 h-3.5 text-slate-500 ${summaryLoading || clausesLoading ? 'animate-spin' : ''}`} />
            <span>Re-analyze</span>
          </button>
          <button onClick={() => setIsChecklistOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold shadow-2xs transition-colors">
            <CheckSquare className="w-4 h-4 text-indigo-600" />
            <span>Lawyer Checklist & Export</span>
          </button>
        </div>
      </header>

      <DisclaimerBanner compact />

      {/* Tab Controls for Mobile */}
      <div role="tablist" aria-label="Document view tabs" className="lg:hidden bg-white border-b border-slate-200 px-4 flex items-center gap-2 text-xs font-medium shrink-0 overflow-x-auto">
        {[...TABS, { id: 'original' as const, label: 'Original Text' }].map(({ id, label }) => (
          <button key={id} role="tab" aria-selected={activeTab === id} aria-controls={`tabpanel-${id}`} onClick={() => setActiveTab(id)}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            <span>{label}</span>
            {id === 'clauses' && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px]">{document.clauses.length}</span>}
          </button>
        ))}
      </div>

      {/* Two-Pane Workspace Body */}
      <div className="flex-1 overflow-hidden p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div id="tabpanel-original" role="tabpanel" aria-label="Original Text" className={`lg:col-span-6 h-full flex flex-col min-h-0 ${activeTab === 'original' ? 'block' : 'hidden lg:block'}`}>
          <DocumentViewer sections={document.sections} activeSectionId={activeSectionId} onSelectSection={setActiveSectionId} highlightedQuote={highlightedQuote} />
        </div>

        <div id={`tabpanel-${activeTab}`} role="tabpanel" aria-label={TABS.find((t) => t.id === activeTab)?.label || 'Analysis content'} className={`lg:col-span-6 h-full flex flex-col min-h-0 ${activeTab !== 'original' ? 'block' : 'hidden lg:flex'}`}>
          {/* Desktop Tab Switcher */}
          <div role="tablist" aria-label="Analysis tabs" className="hidden lg:flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl mb-3 shrink-0">
            {TABS.map(({ id, label }) => (
              <button key={id} role="tab" aria-selected={activeTab === id} aria-controls={`tabpanel-${id}`} onClick={() => setActiveTab(id)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                <span>{label}</span>
                {id === 'clauses' && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px]">{document.clauses.length}</span>}
              </button>
            ))}
          </div>

          {activeTab === 'summary' && (
            <SummaryTab
              summary={document.summary} sections={document.sections}
              summaryLoading={summaryLoading} summaryError={summaryError}
              onRetrySummary={() => runAnalysis('summary')} onJumpToSource={handleJumpToSource}
            />
          )}
          {activeTab === 'clauses' && (
            <ClauseFlagsTab
              clauses={document.clauses} clausesLoading={clausesLoading} clausesError={clausesError}
              onRetryClauses={() => runAnalysis('clauses')} onJumpToClause={handleJumpToClauseSource}
              onAskAboutClause={handleAskAboutClause}
            />
          )}
          {activeTab === 'chat' && (
            <DocumentQATab
              chunks={document.chunks} rawText={document.rawText}
              chatInitialQuery={chatInitialQuery} onJumpToCitation={handleJumpToClauseSource}
            />
          )}
        </div>
      </div>

      <LawyerChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} document={document} />
    </div>
  );
}
