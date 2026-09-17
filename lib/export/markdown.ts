import { LegalLensDocument } from '@/types/document';
import { LEGAL_DISCLAIMER } from '../constants';

export function generateDocumentMarkdown(doc: LegalLensDocument): string {
  const parts: string[] = [];

  parts.push(`# LegalLens Analysis Report: ${doc.fileName}`);
  parts.push(`*Generated on ${new Date().toLocaleDateString()} by LegalLens*\n`);

  parts.push(`> [!IMPORTANT]\n> **LEGAL DISCLAIMER**\n> ${LEGAL_DISCLAIMER}\n`);

  if (doc.summary) {
    parts.push(`## 1. Document Overview`);
    parts.push(`- **Document Type:** ${doc.summary.documentType}`);
    if (doc.summary.mainParties && doc.summary.mainParties.length > 0) {
      parts.push(`- **Parties:** ${doc.summary.mainParties.join(', ')}`);
    }
    if (doc.summary.effectiveDateOrTerm) {
      parts.push(`- **Term / Effective Date:** ${doc.summary.effectiveDateOrTerm}`);
    }
    parts.push(`\n${doc.summary.overview}\n`);

    if (doc.summary.keyTakeaways && doc.summary.keyTakeaways.length > 0) {
      parts.push(`### Key Takeaways`);
      for (const t of doc.summary.keyTakeaways) {
        parts.push(`- ${t}`);
      }
      parts.push('');
    }
  }

  // Lawyer Checklist
  if (doc.lawyerChecklist && doc.lawyerChecklist.length > 0) {
    parts.push(`## 2. Checklist: Questions to Ask a Lawyer & Things to Clarify\n`);
    parts.push(
      `*Use these tailored questions during a consultation with a licensed attorney or in preliminary negotiations.*\n`
    );

    const questions = doc.lawyerChecklist.filter((c) => c.type === 'question');
    const negotiations = doc.lawyerChecklist.filter((c) => c.type === 'negotiation');

    if (negotiations.length > 0) {
      parts.push(`### Items Requiring Clarification / Negotiation (High Attention)`);
      for (const item of negotiations) {
        parts.push(`- [ ] **${item.text}**`);
        parts.push(`  - *Context:* ${item.context}`);
        parts.push(`  - *Source:* ${item.sourceSection}\n`);
      }
    }

    if (questions.length > 0) {
      parts.push(`### Questions to Clarify with an Attorney`);
      for (const item of questions) {
        parts.push(`- [ ] **${item.text}**`);
        parts.push(`  - *Context:* ${item.context}`);
        parts.push(`  - *Source:* ${item.sourceSection}\n`);
      }
    }
  }

  // Flagged Clauses
  if (doc.clauses && doc.clauses.length > 0) {
    parts.push(`## 3. Detected Clauses & Attention Flags\n`);
    for (const c of doc.clauses) {
      parts.push(`### [${c.attentionLevel.toUpperCase()} ATTENTION] ${c.title}`);
      parts.push(`- **Category:** ${c.category}`);
      parts.push(`- **Source Section:** ${c.sourceSection}`);
      parts.push(`- **Why it flagged:** ${c.reason}`);
      parts.push(`- **Plain English Explanation:** ${c.plainLanguageExplanation}`);
      parts.push(`- **Exact Excerpt:**\n  > "${c.quote}"`);
      if (c.questionForLawyer) {
        parts.push(`- **Recommended Inquiry:** ${c.questionForLawyer}`);
      }
      parts.push('');
    }
  }

  // Section Summaries
  if (doc.sections && doc.sections.length > 0) {
    parts.push(`## 4. Section-by-Section Plain-Language Breakdown\n`);
    for (const sec of doc.sections) {
      parts.push(`### ${sec.title}`);
      parts.push(`${sec.plainLanguageSummary || 'Standard clause.'}\n`);
      if (sec.keyPoints && sec.keyPoints.length > 0) {
        for (const kp of sec.keyPoints) {
          parts.push(`- ${kp}`);
        }
        parts.push('');
      }
    }
  }

  parts.push(`---\n**REMINDER:** ${LEGAL_DISCLAIMER}\n`);

  return parts.join('\n');
}
