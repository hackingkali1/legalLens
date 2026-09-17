import { jsPDF } from 'jspdf';
import { LegalLensDocument } from '@/types/document';
import { LEGAL_DISCLAIMER } from '../constants';

export function generateDocumentPdfBuffer(doc: LegalLensDocument): Uint8Array {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = margin;

  function checkPageBreak(requiredSpace: number) {
    if (cursorY + requiredSpace > pageHeight - 20) {
      // Print footer disclaimer before adding page
      printPageFooter();
      pdf.addPage();
      cursorY = margin + 10;
      printPageHeader();
    }
  }

  function printPageHeader() {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text(`LegalLens Document Report: ${doc.fileName.slice(0, 40)}`, margin, margin);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, margin + 2, pageWidth - margin, margin + 2);
  }

  function printPageFooter() {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(180, 83, 9); // amber-700
    const disclaimerLines = pdf.splitTextToSize(`DISCLAIMER: ${LEGAL_DISCLAIMER}`, contentWidth);
    pdf.text(disclaimerLines, margin, pageHeight - 12);
  }

  // Cover / Header Banner
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(15, 23, 42); // slate-900
  pdf.text('LegalLens Document Understanding Report', margin, cursorY + 6);
  cursorY += 12;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Analyzed Document: ${doc.fileName} | Generated on ${new Date().toLocaleDateString()}`, margin, cursorY);
  cursorY += 8;

  // Prominent Top Disclaimer Box
  pdf.setFillColor(254, 243, 199); // amber-100
  pdf.setDrawColor(245, 158, 11);  // amber-500
  pdf.roundedRect(margin, cursorY, contentWidth, 16, 2, 2, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(146, 64, 14); // amber-800
  pdf.text('MANDATORY LEGAL NOTICE:', margin + 3, cursorY + 5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const topDisclaimerLines = pdf.splitTextToSize(LEGAL_DISCLAIMER, contentWidth - 6);
  pdf.text(topDisclaimerLines, margin + 3, cursorY + 10);
  cursorY += 22;

  // 1. Overview
  if (doc.summary) {
    checkPageBreak(30);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(30, 41, 59);
    pdf.text('1. Plain-Language Executive Summary', margin, cursorY);
    cursorY += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(51, 65, 85);
    const overviewLines = pdf.splitTextToSize(doc.summary.overview, contentWidth);
    pdf.text(overviewLines, margin, cursorY);
    cursorY += overviewLines.length * 4.5 + 4;

    if (doc.summary.keyTakeaways && doc.summary.keyTakeaways.length > 0) {
      checkPageBreak(25);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text('Key Takeaways:', margin, cursorY);
      cursorY += 5;

      pdf.setFont('helvetica', 'normal');
      for (const takeaway of doc.summary.keyTakeaways) {
        checkPageBreak(8);
        const lines = pdf.splitTextToSize(`• ${takeaway}`, contentWidth - 4);
        pdf.text(lines, margin + 2, cursorY);
        cursorY += lines.length * 4.2;
      }
      cursorY += 4;
    }
  }

  // 2. Lawyer Checklist
  if (doc.lawyerChecklist && doc.lawyerChecklist.length > 0) {
    checkPageBreak(25);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(30, 41, 59);
    pdf.text('2. Action Checklist: Questions for an Attorney', margin, cursorY);
    cursorY += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    for (const item of doc.lawyerChecklist) {
      checkPageBreak(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`[ ] ${item.text}`, margin, cursorY);
      cursorY += 4.5;

      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Context: ${item.context} | Source: ${item.sourceSection}`, margin + 5, cursorY);
      cursorY += 5;
      pdf.setTextColor(51, 65, 85);
    }
    cursorY += 4;
  }

  // 3. Flagged Clauses
  if (doc.clauses && doc.clauses.length > 0) {
    checkPageBreak(25);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(30, 41, 59);
    pdf.text('3. Detected Clauses & Attention Analysis', margin, cursorY);
    cursorY += 6;

    for (const clause of doc.clauses) {
      checkPageBreak(25);
      // Attention indicator box
      const badgeText = `${clause.attentionLevel.toUpperCase()} ATTENTION`;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      if (clause.attentionLevel === 'high') {
        pdf.setTextColor(190, 18, 60); // rose-700
      } else if (clause.attentionLevel === 'medium') {
        pdf.setTextColor(180, 83, 9); // amber-700
      } else {
        pdf.setTextColor(4, 120, 87); // emerald-700
      }
      pdf.text(`[${badgeText}] ${clause.title} (${clause.category})`, margin, cursorY);
      cursorY += 4.5;

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(51, 65, 85);
      const explanationLines = pdf.splitTextToSize(
        `Explanation: ${clause.plainLanguageExplanation}`,
        contentWidth
      );
      pdf.text(explanationLines, margin, cursorY);
      cursorY += explanationLines.length * 4.2;

      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(71, 85, 105);
      const quoteLines = pdf.splitTextToSize(`Quote: "${clause.quote.slice(0, 180)}"`, contentWidth - 4);
      pdf.text(quoteLines, margin + 2, cursorY);
      cursorY += quoteLines.length * 4 + 4;
      pdf.setTextColor(51, 65, 85);
    }
  }

  // Print final page footer
  printPageFooter();

  return new Uint8Array(pdf.output('arraybuffer'));
}
