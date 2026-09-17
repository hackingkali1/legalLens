'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LegalLensDocument } from '@/types/document';
import { analyzeDocumentApi } from '@/lib/api/analysisClient';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';

export interface UseDocumentAnalysisReturn {
  document: LegalLensDocument;
  setDocument: React.Dispatch<React.SetStateAction<LegalLensDocument>>;
  summaryLoading: boolean;
  summaryError: string | null;
  clausesLoading: boolean;
  clausesError: string | null;
  chatInitialQuery: string;
  setChatInitialQuery: React.Dispatch<React.SetStateAction<string>>;
  runAnalysis: (
    step?: 'all' | 'summary' | 'clauses',
    skipCache?: boolean
  ) => Promise<void>;
}

/**
 * Custom hook that encapsulates all data-fetching, per-section loading/error status,
 * and Q&A query state for a document.
 */
export function useDocumentAnalysis(
  initialDocument: LegalLensDocument
): UseDocumentAnalysisReturn {
  const [document, setDocument] = useState<LegalLensDocument>(initialDocument);

  // Per-section loading and error states
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [clausesLoading, setClausesLoading] = useState<boolean>(false);
  const [clausesError, setClausesError] = useState<string | null>(null);

  // Q&A initial query state
  const [chatInitialQuery, setChatInitialQuery] = useState<string>('');

  // Guard against duplicate in-flight calls (e.g. React StrictMode double-mounting)
  const inFlightRef = useRef<{ summary: boolean; clauses: boolean }>({
    summary: false,
    clauses: false,
  });

  const runAnalysis = useCallback(
    async (
      step: 'all' | 'summary' | 'clauses' = 'all',
      skipCache: boolean = false
    ) => {
      // Concurrency guard check
      if (step === 'all') {
        if (inFlightRef.current.summary || inFlightRef.current.clauses) return;
        inFlightRef.current.summary = true;
        inFlightRef.current.clauses = true;
        setSummaryLoading(true);
        setClausesLoading(true);
        setSummaryError(null);
        setClausesError(null);
      } else if (step === 'summary') {
        if (inFlightRef.current.summary) return;
        inFlightRef.current.summary = true;
        setSummaryLoading(true);
        setSummaryError(null);
      } else if (step === 'clauses') {
        if (inFlightRef.current.clauses) return;
        inFlightRef.current.clauses = true;
        setClausesLoading(true);
        setClausesError(null);
      }

      try {
        const data = await analyzeDocumentApi(document, { step, skipCache });

        setDocument((prev) => ({
          ...prev,
          sections: data.sections || prev.sections,
          summary: data.summary || prev.summary,
          clauses: data.clauses || prev.clauses,
          lawyerChecklist: data.lawyerChecklist || prev.lawyerChecklist,
        }));

        // Scoped section error updates if partial failure returned
        if (data.errors?.summary) {
          setSummaryError(data.errors.summary);
        }
        if (data.errors?.clauses) {
          setClausesError(data.errors.clauses);
        }
      } catch (err: unknown) {
        const msg = getUserSafeErrorMessage(
          err,
          'Something went wrong analyzing this document — please try again.'
        );

        if (step === 'all') {
          // Only set error for sections that haven't populated data yet
          if (!document.summary) setSummaryError(msg);
          if (document.clauses.length === 0) setClausesError(msg);
        } else if (step === 'summary') {
          setSummaryError(msg);
        } else if (step === 'clauses') {
          setClausesError(msg);
        }
      } finally {
        if (step === 'all') {
          inFlightRef.current.summary = false;
          inFlightRef.current.clauses = false;
          setSummaryLoading(false);
          setClausesLoading(false);
        } else if (step === 'summary') {
          inFlightRef.current.summary = false;
          setSummaryLoading(false);
        } else if (step === 'clauses') {
          inFlightRef.current.clauses = false;
          setClausesLoading(false);
        }
      }
    },
    [document]
  );

  // Automatically trigger AI analysis if summary or clauses are not yet generated
  useEffect(() => {
    const needsSummary = !document.summary;
    const needsClauses = document.clauses.length === 0;

    if (needsSummary && needsClauses) {
      runAnalysis('all');
    } else if (needsSummary) {
      runAnalysis('summary');
    } else if (needsClauses) {
      runAnalysis('clauses');
    }
  }, []); // Run once on initial mount

  return {
    document,
    setDocument,
    summaryLoading,
    summaryError,
    clausesLoading,
    clausesError,
    chatInitialQuery,
    setChatInitialQuery,
    runAnalysis,
  };
}
