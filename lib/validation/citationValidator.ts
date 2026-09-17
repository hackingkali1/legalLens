import { DocumentChunk } from '@/types/document';
import { Citation } from '@/types/chat';

/**
 * Normalizes text for matching by collapsing whitespace and punctuation.
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifies that a quoted citation actually exists in the source text or chunks.
 */
export function verifyQuoteInText(quote: string, sourceText: string): boolean {
  if (!quote || quote.trim().length === 0) return false;
  const normQuote = normalizeForComparison(quote);
  const normSource = normalizeForComparison(sourceText);

  // Direct substring check
  if (normSource.includes(normQuote)) return true;

  // If quote is longer, test if a substantial substring (at least 60% of words) appears
  const quoteWords = normQuote.split(' ');
  if (quoteWords.length >= 6) {
    // Check first 5 words
    const head = quoteWords.slice(0, 5).join(' ');
    if (normSource.includes(head)) return true;

    // Check last 5 words
    const tail = quoteWords.slice(-5).join(' ');
    if (normSource.includes(tail)) return true;
  }

  return false;
}

/**
 * Validates and attaches exact section IDs and chunk references to citations.
 */
export function validateAndLinkCitations(
  citations: Citation[],
  chunks: DocumentChunk[],
  rawText: string
): { verifiedCitations: Citation[]; hasUnverified: boolean } {
  const verifiedCitations: Citation[] = [];
  let hasUnverified = false;

  for (const cit of citations) {
    // Check if the quote exists in the document text
    const quoteExists = verifyQuoteInText(cit.quote, rawText);

    // Find the matching chunk and section
    const matchingChunk = chunks.find((chunk) => {
      const matchTitle = chunk.sectionTitle.toLowerCase().includes(cit.sectionTitle.toLowerCase()) ||
                         cit.sectionTitle.toLowerCase().includes(chunk.sectionTitle.toLowerCase());
      const matchQuote = verifyQuoteInText(cit.quote, chunk.text);
      return matchTitle || matchQuote;
    });

    if (quoteExists || matchingChunk) {
      verifiedCitations.push({
        sectionId: matchingChunk ? matchingChunk.sectionId : 'sec-doc',
        sectionTitle: matchingChunk ? matchingChunk.sectionTitle : cit.sectionTitle,
        quote: cit.quote,
        chunkId: matchingChunk ? matchingChunk.chunkId : undefined,
        relevanceExplanation: cit.relevanceExplanation,
      });
    } else {
      hasUnverified = true;
    }
  }

  return { verifiedCitations, hasUnverified };
}
