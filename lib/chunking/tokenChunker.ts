import { DocumentSection, DocumentChunk } from '@/types/document';

const TARGET_CHUNK_CHARS = 1800; // ~450-500 tokens
const OVERLAP_CHARS = 350;       // ~90-100 tokens

export function createDocumentChunks(sections: DocumentSection[]): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const sec of sections) {
    const text = sec.originalText.trim();
    if (!text) continue;

    // If section fits in a single chunk comfortably
    if (text.length <= TARGET_CHUNK_CHARS) {
      chunks.push({
        chunkId: `chunk-${sec.id}-0`,
        sectionId: sec.id,
        sectionTitle: sec.title,
        text,
        charStart: sec.startIndex,
        charEnd: sec.endIndex,
        tokenEstimate: Math.round(text.split(/\s+/).length * 1.3),
      });
      continue;
    }

    // Split long section into overlapping slices along sentence/paragraph boundaries
    let start = 0;
    let partIdx = 0;

    while (start < text.length) {
      let end = start + TARGET_CHUNK_CHARS;

      if (end < text.length) {
        // Try to break at a newline or period
        const nextBreak = text.indexOf('\n', end - 150);
        if (nextBreak !== -1 && nextBreak <= end + 150) {
          end = nextBreak + 1;
        } else {
          const nextPeriod = text.indexOf('. ', end - 100);
          if (nextPeriod !== -1 && nextPeriod <= end + 100) {
            end = nextPeriod + 2;
          }
        }
      } else {
        end = text.length;
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText.length > 20) {
        chunks.push({
          chunkId: `chunk-${sec.id}-${partIdx}`,
          sectionId: sec.id,
          sectionTitle: sec.title,
          text: chunkText,
          charStart: sec.startIndex + start,
          charEnd: sec.startIndex + end,
          tokenEstimate: Math.round(chunkText.split(/\s+/).length * 1.3),
        });
        partIdx++;
      }

      if (end >= text.length) break;
      start = end - OVERLAP_CHARS;
    }
  }

  return chunks;
}
