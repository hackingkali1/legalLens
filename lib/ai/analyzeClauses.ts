import { DocumentSection } from '@/types/document';
import { ClauseItem, LawyerChecklistItem } from '@/types/clause';
import { createStructuredCompletion } from './nvidia';
import { SYSTEM_PROMPT } from '../prompts/system';
import { CLAUSE_DETECTION_PROMPT } from '../prompts/clauses';
import { ClauseExtractionResponseSchema, ClauseItemSchema } from '../validation/clauseSchema';
import { verifyQuoteInText } from '../validation/citationValidator';
import { createClauseAnalysisChunks, ClauseChunk } from '../chunking/clauseChunker';
import { z } from 'zod';

type RawClause = z.infer<typeof ClauseItemSchema>;

const ATTENTION_RANK: Record<'low' | 'medium' | 'high', number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Normalizes text for fuzzy quote comparison: converts to lowercase and strips punctuation/excess whitespace.
 */
function normalizeQuoteText(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Computes Jaccard word-overlap similarity between two normalized strings.
 */
function computeWordJaccardSimilarity(s1: string, s2: string): number {
  const words1 = new Set(s1.split(' ').filter((w) => w.length > 2));
  const words2 = new Set(s2.split(' ').filter((w) => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  const union = words1.size + words2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Determines whether two extracted clauses are duplicates (e.g. spanning a chunk boundary).
 */
export function areDuplicateClauses(c1: RawClause, c2: RawClause): boolean {
  // 1. Exact quote equality
  if (c1.quote.trim().toLowerCase() === c2.quote.trim().toLowerCase()) {
    return true;
  }

  // 2. Substring containment on normalized quotes (for quotes > 15 chars)
  const norm1 = normalizeQuoteText(c1.quote);
  const norm2 = normalizeQuoteText(c2.quote);

  if (norm1.length > 15 && norm2.length > 15) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return true;
    }
    // High word overlap across chunks
    if (computeWordJaccardSimilarity(norm1, norm2) >= 0.7) {
      return true;
    }
  }

  // 3. Same category + identical title + matching source section
  if (
    c1.category === c2.category &&
    c1.title.trim().toLowerCase() === c2.title.trim().toLowerCase() &&
    (c1.sourceSection.toLowerCase().includes(c2.sourceSection.toLowerCase()) ||
      c2.sourceSection.toLowerCase().includes(c1.sourceSection.toLowerCase()))
  ) {
    return true;
  }

  return false;
}

/**
 * Merges two duplicate clauses into one comprehensive clause entry.
 * Prioritizes higher attention level, longer verbatim quote, and richer explanation.
 */
export function mergeDuplicateClauses(existing: RawClause, incoming: RawClause): RawClause {
  const attentionLevel =
    ATTENTION_RANK[incoming.attentionLevel] > ATTENTION_RANK[existing.attentionLevel]
      ? incoming.attentionLevel
      : existing.attentionLevel;

  const quote =
    incoming.quote.trim().length > existing.quote.trim().length
      ? incoming.quote
      : existing.quote;

  const reason =
    incoming.reason.trim().length > existing.reason.trim().length
      ? incoming.reason
      : existing.reason;

  const plainLanguageExplanation =
    incoming.plainLanguageExplanation.trim().length >
    existing.plainLanguageExplanation.trim().length
      ? incoming.plainLanguageExplanation
      : existing.plainLanguageExplanation;

  const questionForLawyer =
    existing.questionForLawyer || incoming.questionForLawyer;

  return {
    ...existing,
    attentionLevel,
    quote,
    reason,
    plainLanguageExplanation,
    questionForLawyer,
  };
}

/**
 * Deduplicates an array of raw clauses using the chunk-boundary deduplication rules.
 */
export function deduplicateClauseList(rawClauses: RawClause[]): RawClause[] {
  const unified: RawClause[] = [];

  for (const incoming of rawClauses) {
    const existingIdx = unified.findIndex((existing) =>
      areDuplicateClauses(existing, incoming)
    );

    if (existingIdx !== -1) {
      unified[existingIdx] = mergeDuplicateClauses(unified[existingIdx], incoming);
    } else {
      unified.push(incoming);
    }
  }

  return unified;
}

import { sessionAnalysisCache } from '../cache/analysisCache';

export interface DetectClausesOptions {
  customApiKey?: string;
  skipCache?: boolean;
}

export async function detectAndClassifyClauses(
  documentText: string,
  sections: DocumentSection[],
  customApiKeyOrOptions?: string | DetectClausesOptions
): Promise<{
  clauses: ClauseItem[];
  lawyerChecklist: LawyerChecklistItem[];
  updatedSections: DocumentSection[];
}> {
  const options: DetectClausesOptions =
    typeof customApiKeyOrOptions === 'string'
      ? { customApiKey: customApiKeyOrOptions }
      : customApiKeyOrOptions || {};

  const customApiKey = options.customApiKey;
  const skipCache = options.skipCache ?? false;

  const trimmedDoc = (documentText || '').trim();

  // Edge case: Empty document text or text under minimum threshold
  if (!trimmedDoc || trimmedDoc.length < 30) {
    return {
      clauses: [],
      lawyerChecklist: [],
      updatedSections: sections.map((sec) => ({
        ...sec,
        flagCount: { low: 0, medium: 0, high: 0 },
      })),
    };
  }

  // Document-level cache check: if whole document was analyzed before and not busting cache
  const docHash = sessionAnalysisCache.computeHash(trimmedDoc);
  const docCacheKey = `doc-clauses:${docHash}`;
  if (!skipCache) {
    const cachedDocResult = sessionAnalysisCache.get<{
      clauses: ClauseItem[];
      lawyerChecklist: LawyerChecklistItem[];
      updatedSections: DocumentSection[];
    }>(docCacheKey);
    if (cachedDocResult) {
      return cachedDocResult;
    }
  }

  // 1. Chunk document by section/clause headings first, falling back to overlapping chunks
  const chunks: ClauseChunk[] = createClauseAnalysisChunks(sections, trimmedDoc);
  if (chunks.length === 0) {
    return {
      clauses: [],
      lawyerChecklist: [],
      updatedSections: sections,
    };
  }

  // 2. Execute structured completion on each chunk through the sanitizer + retry pipeline
  // Per-chunk caching: check if this individual chunk was already analyzed
  const allExtractedClauses: RawClause[] = [];
  const concurrency = 2;

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (chunk) => {
        const chunkHash = sessionAnalysisCache.computeHash(chunk.text);
        const chunkCacheKey = `clause-chunk:${chunkHash}`;

        // Check per-chunk cache
        if (!skipCache) {
          const cachedChunkClauses = sessionAnalysisCache.get<RawClause[]>(chunkCacheKey);
          if (cachedChunkClauses) {
            return cachedChunkClauses;
          }
        }

        const parsedJson = await createStructuredCompletion({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: CLAUSE_DETECTION_PROMPT(chunk.text) },
          ],
          temperature: 0.1,
          max_tokens: 4500,
          customApiKey,
        });

        // Normalize candidate if the model returned an array of clauses directly
        let candidate: unknown = parsedJson;
        if (Array.isArray(parsedJson)) {
          candidate = { clauses: parsedJson };
        }

        const validated = ClauseExtractionResponseSchema.parse(candidate);

        // Store in per-chunk cache
        sessionAnalysisCache.set(chunkCacheKey, validated.clauses);
        return validated.clauses;
      })
    );

    for (const res of batchResults) {
      allExtractedClauses.push(...res);
    }
  }

  // 3. Aggregate results across chunks and deduplicate overlapping boundary flags
  const rawUnifiedClauses = deduplicateClauseList(allExtractedClauses);

  // 4. Map unified clauses to document sections & build clean UI models
  const clauses: ClauseItem[] = [];
  const checklist: LawyerChecklistItem[] = [];

  // Track flags per section
  const sectionFlags = new Map<string, { low: number; medium: number; high: number }>();
  for (const s of sections) {
    sectionFlags.set(s.id, { low: 0, medium: 0, high: 0 });
  }

  let clauseIndex = 1;
  for (const rawClause of rawUnifiedClauses) {
    const clauseId = `clause-${clauseIndex++}`;

    // Verify quote in document text
    const isQuoteVerified = verifyQuoteInText(rawClause.quote, documentText);

    // Match to appropriate section
    const matchingSection = sections.find(
      (s) =>
        s.title.toLowerCase().includes(rawClause.sourceSection.toLowerCase()) ||
        rawClause.sourceSection.toLowerCase().includes(s.title.toLowerCase()) ||
        (rawClause.quote && s.originalText.includes(rawClause.quote))
    );

    const targetSectionId = matchingSection ? matchingSection.id : sections[0]?.id || 'sec-1';

    // Update section flags
    const currentFlags = sectionFlags.get(targetSectionId);
    if (currentFlags) {
      if (rawClause.attentionLevel === 'high') currentFlags.high++;
      else if (rawClause.attentionLevel === 'medium') currentFlags.medium++;
      else currentFlags.low++;
    }

    const clauseItem: ClauseItem = {
      id: clauseId,
      category: rawClause.category,
      attentionLevel: rawClause.attentionLevel,
      title: rawClause.title,
      reason: rawClause.reason,
      plainLanguageExplanation: rawClause.plainLanguageExplanation,
      sourceSection: matchingSection ? matchingSection.title : rawClause.sourceSection,
      quote: isQuoteVerified ? rawClause.quote : rawClause.quote.slice(0, 200),
      questionForLawyer: rawClause.questionForLawyer,
    };

    clauses.push(clauseItem);

    // Build checklist item for lawyer
    if (rawClause.questionForLawyer) {
      checklist.push({
        id: `chk-${clauseId}`,
        clauseId,
        type: rawClause.attentionLevel === 'high' ? 'negotiation' : 'question',
        text: rawClause.questionForLawyer,
        context: `${rawClause.title} (${rawClause.attentionLevel} attention): ${rawClause.reason}`,
        sourceSection: clauseItem.sourceSection,
      });
    }
  }

  const updatedSections = sections.map((sec) => ({
    ...sec,
    flagCount: sectionFlags.get(sec.id) || { low: 0, medium: 0, high: 0 },
  }));

  const finalResult = { clauses, lawyerChecklist: checklist, updatedSections };
  sessionAnalysisCache.set(docCacheKey, finalResult);

  return finalResult;
}
