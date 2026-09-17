import { DocumentChunk } from '@/types/document';
import { InMemoryRetrievalIndex, ScoredChunk } from './index';

export function retrieveRelevantChunks(
  query: string,
  chunks: DocumentChunk[],
  topK: number = 4
): ScoredChunk[] {
  if (!chunks || chunks.length === 0) return [];
  const index = new InMemoryRetrievalIndex(chunks);
  return index.search(query, topK);
}

export function formatChunksForPrompt(scoredChunks: ScoredChunk[]): string {
  return scoredChunks
    .map((sc, i) => {
      return `--- CHUNK ${i + 1} [Section: ${sc.chunk.sectionTitle}] ---\n${sc.chunk.text}\n`;
    })
    .join('\n');
}
