/**
 * Specific typed error classes for PDF parsing and extraction failure modes.
 */

export class PdfPasswordProtectedError extends Error {
  readonly code = 'PASSWORD_PROTECTED';
  constructor(message = 'This PDF is password-protected or encrypted. Please remove password protection and try again.') {
    super(message);
    this.name = 'PdfPasswordProtectedError';
  }
}

export class PdfCorruptedError extends Error {
  readonly code = 'CORRUPTED_FILE';
  constructor(message = 'This PDF file appears to be corrupted, damaged, or has an invalid structure.') {
    super(message);
    this.name = 'PdfCorruptedError';
  }
}

export class PdfUnsupportedFormatError extends Error {
  readonly code = 'UNSUPPORTED_FORMAT';
  constructor(message = 'This PDF uses an unsupported format, encoding, or compression standard.') {
    super(message);
    this.name = 'PdfUnsupportedFormatError';
  }
}

export class PdfNoSelectableTextError extends Error {
  readonly code = 'NO_TEXT_LAYER';
  constructor(
    message = 'No readable text layer was detected in this document. It may be blank, unscanned, or contain unreadable imagery.'
  ) {
    super(message);
    this.name = 'PdfNoSelectableTextError';
  }
}
