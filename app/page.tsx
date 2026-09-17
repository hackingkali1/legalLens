'use client';

import React, { useState } from 'react';
import {
  FileText,
  ShieldAlert,
  Search,
  AlertTriangle,
  GitCompare,
  CheckSquare,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { LegalLensDocument } from '@/types/document';
import { DocumentUploadArea } from '@/components/upload/DocumentUploadArea';
import { DocumentWorkspace } from '@/components/document/DocumentWorkspace';
import { DisclaimerBanner } from '@/components/layout/DisclaimerBanner';

export default function HomePage() {
  const [loadedDocument, setLoadedDocument] = useState<LegalLensDocument | null>(null);

  if (loadedDocument) {
    return (
      <DocumentWorkspace
        initialDocument={loadedDocument}
        onReset={() => setLoadedDocument(null)}
      />
    );
  }

  return (
    <div className="flex-1 bg-slate-50 flex flex-col">
      {/* Hero Section */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold shadow-2xs">
          <Sparkles className="w-3.5 h-3.5" />
          <span>GenAI Legal Document Understanding Assistant</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight sm:leading-tight">
          Understand your document before you sign or agree to it.
        </h1>

        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          LegalLens translates dense leases, contracts, terms of service, and NDAs into plain English. Detect obligations, notice deadlines, penalties, and automatic renewals without confusing legalese.
        </p>

        {/* Mandatory Prominent Legal Disclaimer */}
        <div className="max-w-3xl mx-auto text-left">
          <DisclaimerBanner />
        </div>

        {/* Upload Container */}
        <div className="max-w-3xl mx-auto pt-4 text-left">
          <DocumentUploadArea
            onDocumentLoaded={(doc) => setLoadedDocument(doc)}
          />
        </div>
      </section>

      {/* Feature Value Grid */}
      <section aria-labelledby="features-heading" className="py-12 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 id="features-heading" className="text-2xl font-bold text-slate-900">
              Clear insight into your commitments
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Everything you need to review and evaluate contracts with confidence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Plain-Language Section Summaries
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Break down dense paragraphs into clear, everyday English with bulleted key takeaways alongside the original text.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Clause Attention Flags
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Automatically detect obligations, deadlines, penalties, auto-renewals, liabilities, and termination conditions with calibrated attention levels.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Document Q&A with Strict Citations
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Ask specific questions and receive verified answers linked directly to the exact source clause. Refuses out-of-scope queries to eliminate hallucinations.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
                <GitCompare className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Version Comparison Mode
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Upload two document versions to pinpoint added, removed, or modified clauses and understand the material differences in plain English.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center">
                <CheckSquare className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Lawyer Consultation Checklist
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Generates a concrete list of questions and clarification points to discuss with an attorney or bring into preliminary negotiations.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-800 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Session-Only Privacy & Security
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Documents are processed in-memory and never permanently stored. No sensitive text is logged, preserving client confidentiality.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-slate-50 py-8 px-4 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto space-y-2">
          <p className="font-semibold text-slate-700">
            LegalLens &bull; GenAI Legal Document Understanding Assistant
          </p>
          <p>
            This application is for informational and educational purposes only and does not constitute legal advice. Always consult a qualified licensed attorney for specific legal matters.
          </p>
        </div>
      </footer>
    </div>
  );
}
