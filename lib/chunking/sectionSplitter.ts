import { DocumentSection } from '@/types/document';

// Regex patterns commonly used for legal section headings
const HEADING_PATTERNS = [
  // "Article 1. Definitions" or "ARTICLE II: CONFIDENTIALITY"
  /^(?:ARTICLE|Article)\s+([0-9IVXLCDM]+)[\s.:\u2014\-]+(.*)$/m,
  // "Section 1.01 Notice" or "SECTION 4 - TERMINATION"
  /^(?:SECTION|Section)\s+([0-9]+(?:\.[0-9]+)*)[\s.:\u2014\-]+(.*)$/m,
  // "1. Term and Renewal" or "12. Indemnification:"
  /^([0-9]{1,2})\.\s+([A-Z][^\n]{3,60})$/m,
  // "1.1 Sub-clause" or "3.4 Notice Period"
  /^([0-9]{1,2}\.[0-9]{1,2})\s+([A-Z][^\n]{3,60})$/m,
  // Markdown headings: "# Title", "## Section 2", "### CASE IDENTIFICATION"
  /^(?:#{1,4})\s+(?:([0-9IVXLCDM]+(?:\.[0-9]+)*)\.?\s+)?([A-Za-z0-9\s,&/\u2014\-]{3,80})$/m,
  // All-caps headers on their own line: "TERMINATION AND DEFAULT", "DISPUTE RESOLUTION"
  /^([A-Z0-9\s,&/\u2014\-]{4,50}):?$/m,
];

export function splitIntoSections(documentText: string): DocumentSection[] {
  const lines = documentText.split('\n');
  const sections: DocumentSection[] = [];

  let currentTitle = 'Preamble / Recitals';
  let currentSectionNumber: string | undefined = undefined;
  let currentLines: string[] = [];
  let currentStartIndex = 0;
  let charCursor = 0;
  let sectionIndex = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line matches any heading pattern
    let matchedHeading: { title: string; num?: string } | null = null;

    if (trimmed.length > 0 && trimmed.length < 90) {
      for (const pattern of HEADING_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) {
          if (match[2]) {
            matchedHeading = {
              num: match[1],
              title: `${match[1] ? match[1] + ' ' : ''}${match[2].trim()}`,
            };
          } else {
            // All-caps heading
            matchedHeading = {
              title: trimmed.replace(/:$/, ''),
            };
          }
          break;
        }
      }
    }

    // If a new heading is detected and we already have accumulated text
    if (matchedHeading && currentLines.join('\n').trim().length > 40) {
      const sectionText = currentLines.join('\n').trim();
      sections.push({
        id: `sec-${sectionIndex++}`,
        sectionNumber: currentSectionNumber,
        title: currentTitle,
        originalText: sectionText,
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: currentStartIndex,
        endIndex: charCursor,
      });

      currentTitle = matchedHeading.title;
      currentSectionNumber = matchedHeading.num;
      currentLines = [];
      currentStartIndex = charCursor;
    } else if (matchedHeading && currentLines.length === 0) {
      currentTitle = matchedHeading.title;
      currentSectionNumber = matchedHeading.num;
    }

    currentLines.push(line);
    charCursor += line.length + 1; // +1 for the newline
  }

  // Push remaining lines as final section
  if (currentLines.length > 0 && currentLines.join('\n').trim().length > 0) {
    sections.push({
      id: `sec-${sectionIndex}`,
      sectionNumber: currentSectionNumber,
      title: currentTitle,
      originalText: currentLines.join('\n').trim(),
      plainLanguageSummary: '',
      keyPoints: [],
      startIndex: currentStartIndex,
      endIndex: charCursor,
    });
  }

  // If document was short or lacked headers, fallback to paragraph blocks
  if (sections.length <= 1 && documentText.length > 1500) {
    return fallbackParagraphSplit(documentText);
  }

  return sections;
}

/**
 * Fallback splitter when no formal legal headings are detected.
 * Groups by double newlines into ~400-600 word sections.
 */
function fallbackParagraphSplit(text: string): DocumentSection[] {
  const paragraphs = text.split(/\n\s*\n/);
  const sections: DocumentSection[] = [];
  let currentBlock: string[] = [];
  let blockWordCount = 0;
  let sectionIndex = 1;
  let charCursor = 0;
  let startIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const words = trimmed.split(/\s+/).length;
    currentBlock.push(trimmed);
    blockWordCount += words;

    if (blockWordCount >= 350) {
      const blockText = currentBlock.join('\n\n');
      const firstFewWords = blockText.slice(0, 45).replace(/\n/g, ' ').trim();
      sections.push({
        id: `sec-${sectionIndex}`,
        title: `Section ${sectionIndex}: ${firstFewWords}...`,
        originalText: blockText,
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex,
        endIndex: charCursor + blockText.length,
      });
      sectionIndex++;
      currentBlock = [];
      blockWordCount = 0;
      startIndex = charCursor + blockText.length + 2;
    }

    charCursor += para.length + 2;
  }

  if (currentBlock.length > 0) {
    const blockText = currentBlock.join('\n\n');
    const firstFewWords = blockText.slice(0, 45).replace(/\n/g, ' ').trim();
    sections.push({
      id: `sec-${sectionIndex}`,
      title: `Section ${sectionIndex}: ${firstFewWords}...`,
      originalText: blockText,
      plainLanguageSummary: '',
      keyPoints: [],
      startIndex,
      endIndex: text.length,
    });
  }

  return sections;
}
