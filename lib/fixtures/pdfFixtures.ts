import { jsPDF } from 'jspdf';
import { createCanvas } from '@napi-rs/canvas';

/**
 * Creates a valid PDF buffer with a selectable text layer.
 */
export function createNormalTextPdfBuffer(): Buffer {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('RESIDENTIAL LEASE AGREEMENT', 14, 20);
  doc.setFontSize(12);
  doc.text(
    'Section 1. Premises and Term\nLandlord agrees to lease to Tenant the real property located at 742 Evergreen Terrace.\nThe term shall begin on December 1, 2026 and continue for twelve consecutive months.\n\nSection 2. Monthly Rent\nTenant shall pay Landlord a monthly rent of $2,200.00 due on the first day of each calendar month.',
    14,
    35
  );
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/**
 * Creates a valid PDF that contains purely a raster image of contract text
 * without any selectable PDF text layer (simulating a physical scanned document).
 */
export function createScannedImagePdfBuffer(): Buffer {
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');

  // White paper background
  ctx.fillStyle = '#fbfbfb';
  ctx.fillRect(0, 0, 800, 400);

  // Black contract text rendered onto canvas bitmap
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('MUTUAL NON-DISCLOSURE AGREEMENT', 30, 60);

  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('1. Definition of Confidential Information', 30, 120);

  ctx.font = 'normal 18px sans-serif';
  ctx.fillText('The parties agree to protect proprietary trade secrets from unauthorized disclosure.', 30, 160);
  ctx.fillText('This obligation continues in full force and effect for three years from disclosure.', 30, 200);

  const pngBuffer = canvas.toBuffer('image/png');

  const doc = new jsPDF({ orientation: 'portrait' });
  doc.addImage(pngBuffer.toString('base64'), 'PNG', 10, 10, 190, 95);
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/**
 * Creates a valid PDF structure configured with a Standard Security / Encrypt dictionary
 * that enforces password protection.
 */
export function createPasswordProtectedPdfBuffer(): Buffer {
  const pdfString =
    '%PDF-1.4\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n' +
    '4 0 obj\n<< /Filter /Standard /V 1 /R 2 /O <0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef> /U <0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef> /P -4 >>\nendobj\n' +
    '5 0 obj\n<< /Length 20 >>\nstream\n(EncryptedSecretData)Q\nendstream\nendobj\n' +
    'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000201 00000 n \n0000000350 00000 n \n' +
    'trailer\n<< /Size 6 /Root 1 0 R /Encrypt 4 0 R /ID [<12345678901234567890123456789012><12345678901234567890123456789012>] >>\nstartxref\n422\n%%EOF';

  return Buffer.from(pdfString, 'latin1');
}

/**
 * Creates a corrupted PDF buffer missing xref, trailer, and valid object structure.
 */
export function createCorruptedPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\nCorrupted binary fragments without objects or trailer\n');
}
