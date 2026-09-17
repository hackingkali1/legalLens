import { describe, it, expect } from 'vitest';
import { splitIntoSections } from '@/lib/chunking/sectionSplitter';
import { createDocumentChunks } from '@/lib/chunking/tokenChunker';
import { SAMPLE_LEASE_TEXT } from '@/lib/fixtures/samples';

describe('Document Section Splitting & Chunking', () => {
  it('splits legal document text into structured sections by header', () => {
    const sections = splitIntoSections(SAMPLE_LEASE_TEXT);
    expect(sections.length).toBeGreaterThanOrEqual(7);

    const sectionTitles = sections.map((s) => s.title);
    expect(sectionTitles.some((t) => t.includes('RENT AND PAYMENT DEADLINES'))).toBe(true);
    expect(sectionTitles.some((t) => t.includes('AUTOMATIC RENEWAL'))).toBe(true);
    expect(sectionTitles.some((t) => t.includes('INDEMNIFICATION AND LIABILITY'))).toBe(true);
    expect(sectionTitles.some((t) => t.includes('TERMINATION AND DEFAULT'))).toBe(true);

    // Each section must have valid positive character offsets
    for (const sec of sections) {
      expect(sec.id).toMatch(/^sec-\d+$/);
      expect(sec.originalText.length).toBeGreaterThan(0);
      expect(sec.endIndex).toBeGreaterThan(sec.startIndex);
    }
  });

  it('creates overlapping chunks with section metadata and token estimates', () => {
    const sections = splitIntoSections(SAMPLE_LEASE_TEXT);
    const chunks = createDocumentChunks(sections);

    expect(chunks.length).toBeGreaterThanOrEqual(sections.length);

    for (const chunk of chunks) {
      expect(chunk.chunkId).toBeDefined();
      expect(chunk.sectionId).toBeDefined();
      expect(chunk.sectionTitle).toBeDefined();
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.tokenEstimate).toBeGreaterThan(0);
    }
  });

  it('handles fallback splitting on unstructured documents', () => {
    const longUnstructured = Array(15)
      .fill(
        'This is a paragraph without formal headings detailing miscellaneous operational terms and standard mutual expectations under commercial guidelines.'
      )
      .join('\n\n');

    const sections = splitIntoSections(longUnstructured);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sections[0].title).toBeDefined();
  });
});
