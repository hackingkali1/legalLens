import { DocumentDiffResult } from '@/types/compare';
import { createStructuredCompletion } from './nvidia';
import { SYSTEM_PROMPT } from '../prompts/system';
import { DOCUMENT_COMPARE_PROMPT } from '../prompts/compare';
import { CompareResponseSchema } from '../validation/clauseSchema';
import { LEGAL_DISCLAIMER } from '../constants';

export async function compareTwoDocuments(
  docAName: string,
  docAText: string,
  docBName: string,
  docBText: string,
  customApiKey?: string
): Promise<DocumentDiffResult> {
  const trimmedA = docAText.slice(0, 25000);
  const trimmedB = docBText.slice(0, 25000);

  const parsedJson = await createStructuredCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: DOCUMENT_COMPARE_PROMPT(docAName, trimmedA, docBName, trimmedB) },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    customApiKey,
  });

  // Normalize candidate if the model returned an array of changes directly instead of an object wrapper
  let candidate: unknown = parsedJson;
  if (Array.isArray(parsedJson)) {
    candidate = {
      summaryOverview: 'Comparison completed. Review the material changes below.',
      materialChanges: parsedJson,
      disclaimer: LEGAL_DISCLAIMER,
    };
  } else if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    if (!obj.disclaimer) {
      obj.disclaimer = LEGAL_DISCLAIMER;
    }
    if (!obj.summaryOverview && Array.isArray(obj.materialChanges)) {
      obj.summaryOverview = 'Comparison completed. Review the material changes below.';
    }
  }

  const validated = CompareResponseSchema.parse(candidate);

  return {
    docAName,
    docBName,
    summaryOverview: validated.summaryOverview,
    materialChanges: validated.materialChanges.map((mc, idx) => ({
      ...mc,
      id: `diff-${idx + 1}`,
    })),
    disclaimer: LEGAL_DISCLAIMER,
  };
}
