import mammoth from 'mammoth';
import JSZip from 'jszip';

export async function parseDocxBuffer(buffer: Buffer): Promise<{ text: string }> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    let cleanText = result.value.replace(/\r\n/g, '\n').trim();

    // Mammoth extracts word/document.xml (paragraphs, lists, and tables) by design,
    // but silently ignores word/header*.xml and word/footer*.xml files.
    // In legal contracts, headers and footers frequently contain essential terms,
    // confidentiality clauses, agreement titles, and governing law statements.
    // We inspect the DOCX zip archive to extract headers and footers when present.
    try {
      const zip = await JSZip.loadAsync(buffer);
      const headerTexts: string[] = [];
      const footerTexts: string[] = [];

      const extractTextFromXml = (xmlStr: string): string => {
        const matches = xmlStr.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
        if (!matches) return '';
        return matches
          .map((m) => m.replace(/<[^>]+>/g, ''))
          .join(' ')
          .trim();
      };

      const headerFiles = Object.keys(zip.files).filter((f) => /^word\/header\d*\.xml$/.test(f));
      for (const hf of headerFiles) {
        const fileObj = zip.files[hf];
        if (fileObj) {
          const xml = await fileObj.async('text');
          const hText = extractTextFromXml(xml);
          if (hText) headerTexts.push(hText);
        }
      }

      const footerFiles = Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f));
      for (const ff of footerFiles) {
        const fileObj = zip.files[ff];
        if (fileObj) {
          const xml = await fileObj.async('text');
          const fText = extractTextFromXml(xml);
          if (fText) footerTexts.push(fText);
        }
      }

      const parts: string[] = [];
      if (headerTexts.length > 0) parts.push(headerTexts.join('\n'));
      if (cleanText) parts.push(cleanText);
      if (footerTexts.length > 0) parts.push(footerTexts.join('\n'));

      cleanText = parts.join('\n\n').trim();
    } catch {
      // If zip extraction encounters non-standard structure, fallback to mammoth text
    }

    if (!cleanText || cleanText.length === 0) {
      throw new Error('No readable text content found in DOCX file.');
    }

    return { text: cleanText };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse DOCX document: ${message}`);
  }
}
