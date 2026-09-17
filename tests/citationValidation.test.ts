import { describe, it, expect } from 'vitest';
import { verifyQuoteInText, validateAndLinkCitations } from '@/lib/validation/citationValidator';
import { splitIntoSections } from '@/lib/chunking/sectionSplitter';
import { createDocumentChunks } from '@/lib/chunking/tokenChunker';
import { SAMPLE_LEASE_TEXT } from '@/lib/fixtures/samples';
import { Citation } from '@/types/chat';

describe('Anti-Hallucination & Citation Verification', () => {
  const sections = splitIntoSections(SAMPLE_LEASE_TEXT);
  const chunks = createDocumentChunks(sections);

  it('verifies exact quotes that exist in the document text', () => {
    const validQuote = 'late penalty fee of $150.00 plus $15.00 per day';
    expect(verifyQuoteInText(validQuote, SAMPLE_LEASE_TEXT)).toBe(true);
  });

  it('rejects fabricated quotes that do not exist in the source text', () => {
    const fakeQuote = 'The tenant shall be granted a complimentary swimming pool pass';
    expect(verifyQuoteInText(fakeQuote, SAMPLE_LEASE_TEXT)).toBe(false);
  });

  it('links valid citations to actual section and chunk IDs', () => {
    const rawCitations: Citation[] = [
      {
        sectionId: '',
        sectionTitle: '4. AUTOMATIC RENEWAL AND NOTICE REQUIREMENTS',
        quote: 'at least sixty (60) days prior to the expiration',
      },
    ];

    const { verifiedCitations, hasUnverified } = validateAndLinkCitations(
      rawCitations,
      chunks,
      SAMPLE_LEASE_TEXT
    );

    expect(hasUnverified).toBe(false);
    expect(verifiedCitations.length).toBe(1);
    expect(verifiedCitations[0].sectionTitle).toContain('AUTOMATIC RENEWAL');
  });

  it('flags unverified or hallucinated citations', () => {
    const hallucinatedCitations: Citation[] = [
      {
        sectionId: '',
        sectionTitle: 'Nonexistent Section 99',
        quote: 'This text does not exist anywhere in the contract.',
      },
    ];

    const { verifiedCitations, hasUnverified } = validateAndLinkCitations(
      hallucinatedCitations,
      chunks,
      SAMPLE_LEASE_TEXT
    );

    expect(hasUnverified).toBe(true);
    expect(verifiedCitations.length).toBe(0);
  });
});
