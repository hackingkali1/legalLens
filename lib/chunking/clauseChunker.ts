import { DocumentSection } from '@/types/document';
import { splitIntoSections } from './sectionSplitter';

/**
 * Documents at or below this character count are sent to the clause-detection
 * model in a SINGLE chunk with full text (no splitting, no overlap windows).
 * At ~4 chars/token, 22,000 chars ≈ 5,500 tokens — well within Nemotron-70b's
 * 128k-token context window, and large enough to cover the vast majority of
 * contracts uploaded by users (5–15 pages of legal text).
 */
export const CLAUSE_SINGLE_PASS_CHARS = 22_000;

/**
 * For documents exceeding CLAUSE_SINGLE_PASS_CHARS, sections are packed into
 * chunks up to this size before each LLM call. Keeps individual prompts
 * focused on coherent clause groups while avoiding model context overflow.
 */
export const TARGET_CLAUSE_CHUNK_CHARS = 10_000;
export const CLAUSE_CHUNK_OVERLAP_CHARS = 350;

export interface ClauseChunk {
  chunkIndex: number;
  text: string;
  sectionIds: string[];
  sectionTitles: string[];
  charStart: number;
  charEnd: number;
}

/**
 * Creates coherent semantic chunks for legal clause detection:
 * 1. Single-pass: documents <= CLAUSE_SINGLE_PASS_CHARS are returned as one chunk.
 * 2. Structured chunking: packs contiguous sections up to TARGET_CLAUSE_CHUNK_CHARS.
 * 3. Splits oversized individual sections into overlapping windows.
 * 4. Falls back to fixed-size overlapping chunks for unstructured documents.
 */
export function createClauseAnalysisChunks(
  sections: DocumentSection[],
  fullText: string
): ClauseChunk[] {
  const trimmedFullText = fullText.trim();
  if (!trimmedFullText) {
    return [];
  }

  // If sections were not provided or document only has 1 generic section with substantial text,
  // attempt to split into sections first
  let effectiveSections = sections;
  if (!effectiveSections || effectiveSections.length === 0) {
    effectiveSections = splitIntoSections(trimmedFullText);
  }

  // Single-pass path: document fits comfortably in one model call.
  // This covers nearly all real-world uploaded legal documents (5-15 pages).
  if (trimmedFullText.length <= CLAUSE_SINGLE_PASS_CHARS) {
    return [
      {
        chunkIndex: 0,
        text: trimmedFullText,
        sectionIds: effectiveSections.map((s) => s.id),
        sectionTitles: effectiveSections.map((s) => s.title),
        charStart: 0,
        charEnd: trimmedFullText.length,
      },
    ];
  }

  // If structured sections are present (more than 1, or 1 section with a specific heading)
  const isStructured =
    effectiveSections.length > 1 ||
    (effectiveSections.length === 1 && effectiveSections[0].title !== 'Preamble / Recitals');

  if (isStructured) {
    return chunkStructuredSections(effectiveSections);
  }

  // Unstructured fallback: document has no recognized section headings
  return chunkUnstructuredText(trimmedFullText);
}

/**
 * Packs contiguous structured sections into semantic chunks up to TARGET_CLAUSE_CHUNK_CHARS.
 * Splits oversized sections with overlap.
 */
function chunkStructuredSections(sections: DocumentSection[]): ClauseChunk[] {
  const chunks: ClauseChunk[] = [];
  let currentSections: DocumentSection[] = [];
  let currentLength = 0;

  const emitCurrentChunk = () => {
    if (currentSections.length === 0) return;

    const chunkText = currentSections
      .map((s) => `### ${s.title.toUpperCase()}\n${s.originalText.trim()}`)
      .join('\n\n');

    const firstSec = currentSections[0];
    const lastSec = currentSections[currentSections.length - 1];

    chunks.push({
      chunkIndex: chunks.length,
      text: chunkText,
      sectionIds: currentSections.map((s) => s.id),
      sectionTitles: currentSections.map((s) => s.title),
      charStart: firstSec.startIndex,
      charEnd: lastSec.endIndex,
    });

    currentSections = [];
    currentLength = 0;
  };

  for (const sec of sections) {
    const secText = sec.originalText.trim();
    if (!secText) continue;

    // Case A: Section itself is oversized (> TARGET_CLAUSE_CHUNK_CHARS + 300 chars)
    if (secText.length > TARGET_CLAUSE_CHUNK_CHARS + 300) {
      // Flush any accumulated smaller sections first
      emitCurrentChunk();

      // Split this large section into overlapping windows along sentence or newline breaks
      let start = 0;
      let partIdx = 0;

      while (start < secText.length) {
        let end = start + TARGET_CLAUSE_CHUNK_CHARS;

        if (end < secText.length) {
          // Look for clean break (newline or sentence end)
          const nextBreak = secText.indexOf('\n', end - 150);
          if (nextBreak !== -1 && nextBreak <= end + 150) {
            end = nextBreak + 1;
          } else {
            const nextPeriod = secText.indexOf('. ', end - 100);
            if (nextPeriod !== -1 && nextPeriod <= end + 100) {
              end = nextPeriod + 2;
            }
          }
        } else {
          end = secText.length;
        }

        const sliceText = secText.slice(start, end).trim();
        if (sliceText.length > 20) {
          chunks.push({
            chunkIndex: chunks.length,
            text: `### ${sec.title.toUpperCase()} (Part ${partIdx + 1})\n${sliceText}`,
            sectionIds: [sec.id],
            sectionTitles: [sec.title],
            charStart: sec.startIndex + start,
            charEnd: sec.startIndex + end,
          });
          partIdx++;
        }

        if (end >= secText.length) break;
        start = end - CLAUSE_CHUNK_OVERLAP_CHARS;
      }
      continue;
    }

    // Case B: Packing contiguous smaller sections
    if (currentLength + secText.length > TARGET_CLAUSE_CHUNK_CHARS && currentSections.length > 0) {
      emitCurrentChunk();
    }

    currentSections.push(sec);
    currentLength += secText.length + 30; // 30 chars for header formatting overhead
  }

  emitCurrentChunk();
  return chunks;
}

/**
 * Fallback chunker for unstructured text: generates fixed-size overlapping chunks along sentence/paragraph breaks.
 */
function chunkUnstructuredText(text: string): ClauseChunk[] {
  const chunks: ClauseChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + TARGET_CLAUSE_CHUNK_CHARS;

    if (end < text.length) {
      // Find paragraph boundary or sentence break near end
      const paragraphBreak = text.indexOf('\n\n', end - 200);
      if (paragraphBreak !== -1 && paragraphBreak <= end + 100) {
        end = paragraphBreak + 2;
      } else {
        const sentenceBreak = text.indexOf('. ', end - 150);
        if (sentenceBreak !== -1 && sentenceBreak <= end + 100) {
          end = sentenceBreak + 2;
        }
      }
    } else {
      end = text.length;
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 20) {
      chunks.push({
        chunkIndex: chunks.length,
        text: chunkText,
        sectionIds: [`chunk-sec-${chunks.length + 1}`],
        sectionTitles: [`Unstructured Segment ${chunks.length + 1}`],
        charStart: start,
        charEnd: end,
      });
    }

    if (end >= text.length) break;
    start = end - CLAUSE_CHUNK_OVERLAP_CHARS;
  }

  return chunks;
}
