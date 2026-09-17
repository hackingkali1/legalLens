import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

interface DisclaimerBannerProps {
  compact?: boolean;
  inline?: boolean;
  text?: string;
  className?: string;
}

export function DisclaimerBanner({
  compact = false,
  inline = false,
  text,
  className = '',
}: DisclaimerBannerProps) {
  const displayText = text || LEGAL_DISCLAIMER;

  if (inline) {
    return (
      <div
        role="note"
        aria-label="Legal disclaimer"
        className={`flex items-start gap-1.5 text-[11px] text-slate-500 italic ${className}`}
      >
        <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{displayText}</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        role="region"
        aria-label="Legal Notice"
        className={`w-full bg-amber-50/90 border-y border-amber-200/80 px-4 py-2 text-center text-xs font-medium text-amber-900 flex items-center justify-center gap-2 ${className}`}
      >
        <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
        <span>{displayText}</span>
      </div>
    );
  }

  return (
    <aside
      role="region"
      aria-label="Important Legal Disclaimer"
      className="w-full bg-amber-50 border border-amber-300 rounded-xl p-3 sm:p-4 my-2 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-amber-100 rounded-lg text-amber-800 shrink-0 mt-0.5">
          <ShieldAlert className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 text-xs sm:text-sm text-amber-950">
          <p className="font-semibold text-amber-900 mb-0.5">
            Important Legal Notice
          </p>
          <p className="leading-relaxed">
            {LEGAL_DISCLAIMER} LegalLens helps you navigate and understand complex document clauses in plain English, but does not provide legal advice, legal counsel, or recommendations to sign.
          </p>
        </div>
      </div>
    </aside>
  );
}
