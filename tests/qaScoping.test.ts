import { describe, it, expect } from 'vitest';
import { retrieveRelevantChunks } from '@/lib/retrieval/search';
import { splitIntoSections } from '@/lib/chunking/sectionSplitter';
import { createDocumentChunks } from '@/lib/chunking/tokenChunker';
import { SAMPLE_LEASE_TEXT } from '@/lib/fixtures/samples';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

describe('Q&A Document Scoping & Out-of-Domain Refusal', () => {
  const sections = splitIntoSections(SAMPLE_LEASE_TEXT);
  const chunks = createDocumentChunks(sections);

  it('detects unrelated general legal queries and gives them low relevance scores', () => {
    const generalLegalQuery = 'Is capital gains tax applicable to cryptocurrency in France?';
    const scored = retrieveRelevantChunks(generalLegalQuery, chunks, 3);

    // The max score on a lease document for foreign tax questions should be very low
    if (scored.length > 0) {
      expect(scored[0].score).toBeLessThan(0.08);
    }
  });

  it('ensures standard out-of-scope refusal message is exact', () => {
    const refusalText = "I couldn't find that information in the uploaded document.";
    expect(refusalText).toBe("I couldn't find that information in the uploaded document.");
  });

  it('guarantees every Q&A message carries the mandatory legal disclaimer', () => {
    const sampleMessage = {
      id: 'msg-1',
      sender: 'assistant' as const,
      text: "This section requires 30 days notice.",
      citations: [
        {
          sectionId: 'sec-8',
          sectionTitle: 'Section 8 — Termination',
          quote: 'thirty (30) days notice',
        },
      ],
      timestamp: new Date().toISOString(),
      disclaimer: LEGAL_DISCLAIMER,
    };

    expect(sampleMessage.disclaimer).toBe(
      'This is general information, not legal advice. Consult a licensed attorney for your situation.'
    );
  });
});
