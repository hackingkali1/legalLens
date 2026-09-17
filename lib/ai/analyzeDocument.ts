import { DocumentSection, DocumentSummary } from '@/types/document';
import { createStructuredCompletion } from './nvidia';
import { SYSTEM_PROMPT } from '../prompts/system';
import { DOCUMENT_SUMMARY_PROMPT } from '../prompts/summary';
import { DocumentSummaryResponseSchema } from '../validation/clauseSchema';
import { LEGAL_DISCLAIMER } from '../constants';
import { sessionAnalysisCache } from '../cache/analysisCache';

export interface GenerateSummaryOptions {
  customApiKey?: string;
  skipCache?: boolean;
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

  // Format sections text for NVIDIA NIM
  const sectionsInput = sections
    .map(
      (sec) =>
        `### SECTION ID: ${sec.id}\nTITLE: ${sec.title}\nTEXT:\n${sec.originalText.slice(0, 3000)}\n`
    )
    .join('\n');

  const summaryHash = sessionAnalysisCache.computeHash(sectionsInput);
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

  const parsedJson = await createStructuredCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: DOCUMENT_SUMMARY_PROMPT(sectionsInput) },
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
