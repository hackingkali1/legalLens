export function parseRawText(raw: string): { text: string } {
  if (!raw || raw.trim().length === 0) {
    throw new Error('Provided text is empty.');
  }

  // Strip BOM and normalize line breaks
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (normalized.length < 20) {
    throw new Error('Document is too short to be analyzed as a legal agreement (minimum 20 characters required).');
  }

  return { text: normalized };
}
