import { DocumentSection, DocumentSummary } from '@/types/document';
import { createStructuredCompletion } from './nvidia';
import { SYSTEM_PROMPT } from '../prompts/system';
import {
  DOCUMENT_SUMMARY_PROMPT,
  BATCH_SECTION_SUMMARY_PROMPT,
  DOCUMENT_OVERVIEW_SYNTHESIS_PROMPT,
} from '../prompts/summary';
import {
  DocumentSummaryResponseSchema,
  BatchSectionSummaryResponseSchema,
  DocumentOverviewSynthesisSchema,
} from '../validation/clauseSchema';
import { LEGAL_DISCLAIMER } from '../constants';
import { sessionAnalysisCache } from '../cache/analysisCache';

export interface GenerateSummaryOptions {
  customApiKey?: string;
  skipCache?: boolean;
}

/**
 * Single-pass threshold: documents whose total text is at or below this limit
 * are sent to the model in ONE unified prompt, regardless of section count.
 * Nemotron-70b has a 128k-token context window (~450k characters), so 50,000
 * characters (~12,500 tokens) is well within a single request.
 */
export const SINGLE_PASS_MAX_CHARS = 50_000;

export const TARGET_SECTION_BATCH_CHARS = 12_000;
export const MAX_SECTIONS_PER_BATCH = 6;

/**
 * Groups document sections into coherent batches.
 * Only used for documents exceeding SINGLE_PASS_MAX_CHARS (rare, very large docs).
 */
export function batchDocumentSections(
  sections: DocumentSection[],
  maxChars = TARGET_SECTION_BATCH_CHARS,
  maxCount = MAX_SECTIONS_PER_BATCH
): DocumentSection[][] {
  const batches: DocumentSection[][] = [];
  let currentBatch: DocumentSection[] = [];
  let currentChars = 0;

  for (const sec of sections) {
    const secLen = (sec.originalText || '').length;
    if (
      currentBatch.length > 0 &&
      (currentBatch.length >= maxCount || currentChars + secLen > maxChars)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }
    currentBatch.push(sec);
    currentChars += secLen;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export async function generateDocumentSummary(
  sections: DocumentSection[],
  customApiKeyOrOptions?: string | GenerateSummaryOptions
): Promise<{ summary: DocumentSummary; updatedSections: DocumentSection[] }> {
  const options: GenerateSummaryOptions =
    typeof customApiKeyOrOptions === 'string'
      ? { customApiKey: customApiKeyOrOptions }
      : customApiKeyOrOptions || {};

  const customApiKey = options.customApiKey;
  const skipCache = options.skipCache ?? false;

  const totalChars = sections.reduce(
    (acc, sec) => acc + (sec.originalText ? sec.originalText.length : 0),
    0
  );

  // Full document text representation for cache key computation
  const sectionsFullRepresentation = sections
    .map(
      (sec) =>
        `### SECTION ID: ${sec.id}\nTITLE: ${sec.title}\nTEXT:\n${(sec.originalText || '').trim()}\n`
    )
    .join('\n');

  const summaryHash = sessionAnalysisCache.computeHash(sectionsFullRepresentation);
  const cacheKey = `doc-summary:${summaryHash}`;

  if (!skipCache) {
    const cached = sessionAnalysisCache.get<{
      summary: DocumentSummary;
      updatedSections: DocumentSection[];
    }>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Strategy 1: Single unified pass for the vast majority of real-world legal documents.
  // Threshold: totalChars <= SINGLE_PASS_MAX_CHARS (50,000 chars ≈ 12,500 tokens).
  // The section count is intentionally NOT gated — a 9-section lease agreement that
  // is 2,700 chars total runs in 1 call, not 4. Nemotron-70b's 128k context window
  // makes this safe up to ~450k characters before any context concern arises.
  if (totalChars <= SINGLE_PASS_MAX_CHARS) {
    const parsedJson = await createStructuredCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: DOCUMENT_SUMMARY_PROMPT(sectionsFullRepresentation) },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      customApiKey,
    });

    const validated = DocumentSummaryResponseSchema.parse(parsedJson);

    // Create section summary map
    const summaryMap = new Map<string, { plainLanguageSummary: string; keyPoints: string[] }>();
    for (const s of validated.sectionSummaries) {
      summaryMap.set(s.sectionId, {
        plainLanguageSummary: s.plainLanguageSummary,
        keyPoints: s.keyPoints,
      });
    }

    // Update sections with summaries
    const updatedSections = sections.map((sec) => {
      const item = summaryMap.get(sec.id);
      if (item) {
        return {
          ...sec,
          plainLanguageSummary: item.plainLanguageSummary,
          keyPoints: item.keyPoints,
        };
      }
      return {
        ...sec,
        plainLanguageSummary: `This section covers ${sec.title.toLowerCase()}.`,
        keyPoints: [],
      };
    });

    const summary: DocumentSummary = {
      overview: validated.overview,
      documentType: validated.documentType,
      mainParties: validated.mainParties,
      effectiveDateOrTerm: validated.effectiveDateOrTerm,
      keyTakeaways: validated.keyTakeaways,
      disclaimer: LEGAL_DISCLAIMER,
    };

    const result = { summary, updatedSections };
    sessionAnalysisCache.set(cacheKey, result);
    return result;
  }

  // Strategy 2: Very large documents (> 50,000 total chars — rare in practice).
  // Process in section batches with concurrency = 2, then synthesize executive overview.
  const batches = batchDocumentSections(sections);
  const collectedSectionSummaries: Array<{
    sectionId: string;
    plainLanguageSummary: string;
    keyPoints: string[];
  }> = [];

  const concurrency = 2;
  for (let i = 0; i < batches.length; i += concurrency) {
    const batchGroup = batches.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batchGroup.map(async (batch) => {
        const batchInput = batch
          .map(
            (sec) =>
              `### SECTION ID: ${sec.id}\nTITLE: ${sec.title}\nTEXT:\n${(sec.originalText || '').trim()}\n`
          )
          .join('\n');

        const batchHash = sessionAnalysisCache.computeHash(batchInput);
        const batchCacheKey = `section-batch-summary:${batchHash}`;

        if (!skipCache) {
          const cached = sessionAnalysisCache.get<
            Array<{ sectionId: string; plainLanguageSummary: string; keyPoints: string[] }>
          >(batchCacheKey);
          if (cached) return cached;
        }

        const raw = await createStructuredCompletion({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: BATCH_SECTION_SUMMARY_PROMPT(batchInput) },
          ],
          temperature: 0.1,
          max_tokens: 4000,
          customApiKey,
        });

        let candidate: unknown = raw;
        if (Array.isArray(raw)) {
          candidate = { sectionSummaries: raw };
        }

        let parsedSummaries: Array<{
          sectionId: string;
          plainLanguageSummary: string;
          keyPoints: string[];
        }> = [];

        try {
          const validated = BatchSectionSummaryResponseSchema.parse(candidate);
          parsedSummaries = validated.sectionSummaries;
        } catch {
          try {
            const docValidated = DocumentSummaryResponseSchema.parse(candidate);
            parsedSummaries = docValidated.sectionSummaries;
          } catch {
            parsedSummaries = batch.map((s) => ({
              sectionId: s.id,
              plainLanguageSummary: `This section addresses ${s.title.toLowerCase()}.`,
              keyPoints: [],
            }));
          }
        }

        sessionAnalysisCache.set(batchCacheKey, parsedSummaries);
        return parsedSummaries;
      })
    );

    for (const res of batchResults) {
      collectedSectionSummaries.push(...res);
    }
  }

  // Create section summary map
  const summaryMap = new Map<string, { plainLanguageSummary: string; keyPoints: string[] }>();
  for (const s of collectedSectionSummaries) {
    summaryMap.set(s.sectionId, {
      plainLanguageSummary: s.plainLanguageSummary,
      keyPoints: s.keyPoints,
    });
  }

  // Update sections with summaries
  const updatedSections = sections.map((sec) => {
    const item = summaryMap.get(sec.id);
    if (item) {
      return {
        ...sec,
        plainLanguageSummary: item.plainLanguageSummary,
        keyPoints: item.keyPoints,
      };
    }
    return {
      ...sec,
      plainLanguageSummary: `This section covers ${sec.title.toLowerCase()}.`,
      keyPoints: [],
    };
  });

  // Synthesize Document Overview from section summaries and initial preamble
  const summariesSynthesisText = updatedSections
    .map(
      (sec) =>
        `### ${sec.title}\nSummary: ${sec.plainLanguageSummary}\nKey Points: ${sec.keyPoints.join('; ')}`
    )
    .join('\n\n');

  const initialContext = sections[0]?.originalText?.slice(0, 800) || '';
  const synthHash = sessionAnalysisCache.computeHash(
    `${initialContext}|||${summariesSynthesisText}`
  );
  const synthCacheKey = `doc-synth-overview:${synthHash}`;

  let overviewData: {
    overview: string;
    documentType: string;
    mainParties?: string[];
    effectiveDateOrTerm?: string;
    keyTakeaways: string[];
    disclaimer?: string;
  };

  if (!skipCache && sessionAnalysisCache.has(synthCacheKey)) {
    overviewData = sessionAnalysisCache.get(synthCacheKey)!;
  } else {
    const rawSynth = await createStructuredCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: DOCUMENT_OVERVIEW_SYNTHESIS_PROMPT(summariesSynthesisText, initialContext),
        },
      ],
      temperature: 0.1,
      max_tokens: 2500,
      customApiKey,
    });

    try {
      overviewData = DocumentOverviewSynthesisSchema.parse(rawSynth);
    } catch {
      overviewData = {
        overview: 'Comprehensive legal document analysis and summary.',
        documentType: 'Legal Document',
        mainParties: [],
        effectiveDateOrTerm: '',
        keyTakeaways: collectedSectionSummaries.slice(0, 4).map((s) => s.plainLanguageSummary),
        disclaimer: LEGAL_DISCLAIMER,
      };
    }

    sessionAnalysisCache.set(synthCacheKey, overviewData);
  }

  const summary: DocumentSummary = {
    overview: overviewData.overview,
    documentType: overviewData.documentType,
    mainParties: overviewData.mainParties,
    effectiveDateOrTerm: overviewData.effectiveDateOrTerm,
    keyTakeaways: overviewData.keyTakeaways,
    disclaimer: LEGAL_DISCLAIMER,
  };

  const result = { summary, updatedSections };
  sessionAnalysisCache.set(cacheKey, result);
  return result;
}
