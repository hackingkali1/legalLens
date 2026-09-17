import { describe, it, expect } from 'vitest';
import { splitIntoSections } from '@/lib/chunking/sectionSplitter';
import { createDocumentChunks } from '@/lib/chunking/tokenChunker';
import { retrieveRelevantChunks } from '@/lib/retrieval/search';
import { SAMPLE_LEASE_TEXT } from '@/lib/fixtures/samples';

describe('In-Memory Retrieval & Document Scoping', () => {
  const sections = splitIntoSections(SAMPLE_LEASE_TEXT);
  const chunks = createDocumentChunks(sections);

  it('accurately retrieves the termination chunk for termination queries', () => {
    const results = retrieveRelevantChunks('What happens if I terminate early or default on rent?', chunks, 3);
    expect(results.length).toBeGreaterThan(0);
    const topResult = results[0];
    expect(topResult.chunk.sectionTitle.toLowerCase()).toContain('termination');
    expect(topResult.score).toBeGreaterThan(0.2);
  });

  it('accurately retrieves the auto-renewal chunk for renewal queries', () => {
    const results = retrieveRelevantChunks('Does this lease auto renew and what is the notice window?', chunks, 3);
    expect(results.length).toBeGreaterThan(0);
    const topResult = results[0];
    expect(topResult.chunk.sectionTitle.toLowerCase()).toContain('renewal');
    expect(topResult.chunk.text.toLowerCase()).toContain('sixty (60) days');
  });

  it('assigns lower relevance scores to queries unrelated to lease content', () => {
    const results = retrieveRelevantChunks('quantum mechanics wave particle duality', chunks, 3);
    if (results.length > 0) {
      expect(results[0].score).toBeLessThan(0.15);
    }
  });
});
