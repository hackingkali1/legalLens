import { describe, it, expect } from 'vitest';
import { validateUploadedFile } from '@/lib/parsing/validator';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';

describe('File Validation & Security Constraints', () => {
  it('accepts valid PDF, DOCX, and TXT files within limits', () => {
    const validTxt = validateUploadedFile('contract.txt', 5000);
    expect(validTxt.valid).toBe(true);
    expect(validTxt.detectedType).toBe('txt');

    const pdfBuffer = Buffer.from('%PDF-1.4 header and sample data');
    const validPdf = validateUploadedFile('lease.pdf', pdfBuffer.length, pdfBuffer);
    expect(validPdf.valid).toBe(true);
    expect(validPdf.detectedType).toBe('pdf');

    const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const validDocx = validateUploadedFile('nda.docx', docxBuffer.length, docxBuffer);
    expect(validDocx.valid).toBe(true);
    expect(validDocx.detectedType).toBe('docx');
  });

  it('rejects files exceeding 10MB limit', () => {
    const tooLarge = validateUploadedFile('huge_lease.pdf', MAX_FILE_SIZE_BYTES + 1024);
    expect(tooLarge.valid).toBe(false);
    expect(tooLarge.error).toContain('exceeds the maximum allowed limit of 10 MB');
  });

  it('rejects empty files', () => {
    const empty = validateUploadedFile('empty.txt', 0);
    expect(empty.valid).toBe(false);
    expect(empty.error).toContain('empty');
  });

  it('rejects unsupported extensions', () => {
    const unsupported = validateUploadedFile('script.js', 100);
    expect(unsupported.valid).toBe(false);
    expect(unsupported.error).toContain('Unsupported file format');
  });

  it('rejects executable binaries disguised as documents (MZ header / Windows PE)', () => {
    const fakeExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ
    const res = validateUploadedFile('malicious.pdf', fakeExe.length, fakeExe);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Executable binary files are strictly prohibited');
  });

  it('rejects shell scripts disguised as documents', () => {
    const fakeScript = Buffer.from('#!/bin/bash\nrm -rf /');
    const res = validateUploadedFile('script.txt', fakeScript.length, fakeScript);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Script files are strictly prohibited');
  });

  it('rejects Linux ELF binaries', () => {
    const fakeElf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]);
    const res = validateUploadedFile('elf_file.pdf', fakeElf.length, fakeElf);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Executable binaries are strictly prohibited');
  });
});
