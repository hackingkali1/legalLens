import { MAX_FILE_SIZE_BYTES, ALLOWED_EXTENSIONS } from '../constants';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: 'pdf' | 'docx' | 'txt';
}

export interface PastedTextValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePastedText(text?: string): PastedTextValidationResult {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'No document text was provided.' };
  }

  const byteLength = Buffer.byteLength(text, 'utf-8');
  if (byteLength > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (byteLength / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Text size (${sizeMb} MB) exceeds the maximum allowed limit of 10 MB.`,
    };
  }

  return { valid: true };
}

export function validateUploadedFile(
  fileName: string,
  fileSize: number,
  buffer?: Buffer | ArrayBuffer
): FileValidationResult {
  if (!fileName) {
    return { valid: false, error: 'File name is missing.' };
  }

  if (fileSize <= 0) {
    return { valid: false, error: 'File is empty.' };
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (fileSize / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds the maximum allowed limit of 10 MB.`,
    };
  }

  const lowerName = fileName.toLowerCase();
  const ext = '.' + lowerName.split('.').pop();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file format (${ext}). LegalLens accepts PDF, DOCX, and TXT files only.`,
    };
  }

  let detectedType: 'pdf' | 'docx' | 'txt' =
    ext === '.pdf' ? 'pdf' : ext === '.docx' ? 'docx' : 'txt';

  // If buffer is available, verify magic bytes and reject executable signatures
  if (buffer) {
    const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    if (nodeBuf.length >= 2) {
      // Reject Windows PE executable ("MZ")
      if (nodeBuf[0] === 0x4d && nodeBuf[1] === 0x5a) {
        return { valid: false, error: 'Executable binary files are strictly prohibited.' };
      }
      // Reject Shell script shebang ("#!")
      if (nodeBuf[0] === 0x23 && nodeBuf[1] === 0x21) {
        return { valid: false, error: 'Script files are strictly prohibited.' };
      }
    }

    if (nodeBuf.length >= 4) {
      // Reject Linux ELF binary ("\x7fELF")
      if (
        nodeBuf[0] === 0x7f &&
        nodeBuf[1] === 0x45 &&
        nodeBuf[2] === 0x4c &&
        nodeBuf[3] === 0x46
      ) {
        return { valid: false, error: 'Executable binaries are strictly prohibited.' };
      }

      // Verify PDF header: %PDF
      if (ext === '.pdf') {
        const header = nodeBuf.subarray(0, 5).toString('ascii');
        if (!header.startsWith('%PDF')) {
          return {
            valid: false,
            error: 'Invalid PDF format: Missing standard PDF header.',
          };
        }
      }

      // Verify DOCX header: PK\x03\x04
      if (ext === '.docx') {
        if (
          nodeBuf[0] !== 0x50 ||
          nodeBuf[1] !== 0x4b ||
          nodeBuf[2] !== 0x03 ||
          nodeBuf[3] !== 0x04
        ) {
          return {
            valid: false,
            error: 'Invalid DOCX format: Missing standard OpenXML package header.',
          };
        }
      }
    }
  }

  return { valid: true, detectedType };
}
