import { z } from 'zod';

export const ClauseItemSchema = z.object({
  category: z.enum([
    'obligations',
    'deadlines',
    'penalties',
    'auto-renewal',
    'liability',
    'indemnity',
    'termination',
    'other',
  ]),
  attentionLevel: z.enum(['low', 'medium', 'high']),
  title: z.string().min(1),
  reason: z.string().min(1),
  plainLanguageExplanation: z.string().min(1),
  sourceSection: z.string().min(1),
  quote: z.string().min(1),
  questionForLawyer: z.string().min(1),
});

export const ClauseExtractionResponseSchema = z.object({
  clauses: z.array(ClauseItemSchema),
});

export const SectionSummarySchema = z.object({
  sectionId: z.string(),
  plainLanguageSummary: z.string(),
  keyPoints: z.array(z.string()),
});

export const BatchSectionSummaryResponseSchema = z.object({
  sectionSummaries: z.array(SectionSummarySchema),
});

export const DocumentOverviewSynthesisSchema = z.object({
  overview: z.string(),
  documentType: z.string(),
  mainParties: z.array(z.string()).optional().default([]),
  effectiveDateOrTerm: z.string().optional().default(''),
  keyTakeaways: z.array(z.string()),
  disclaimer: z.string().optional(),
});

export const DocumentSummaryResponseSchema = z.object({
  overview: z.string(),
  documentType: z.string(),
  mainParties: z.array(z.string()).optional(),
  effectiveDateOrTerm: z.string().optional(),
  keyTakeaways: z.array(z.string()),
  sectionSummaries: z.array(SectionSummarySchema),
  disclaimer: z.string(),
});

export const CitationSchema = z.object({
  sectionTitle: z.string(),
  quote: z.string(),
  relevanceExplanation: z.string().optional(),
});

export const QAResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
  isOutOfScope: z.boolean(),
  disclaimer: z.string(),
});

export const DiffSourceAnchorSchema = z.object({
  sectionTitle: z.string(),
  quote: z.string().optional().default(''),
});

export const MaterialChangeSchema = z.object({
  title: z.string(),
  type: z.enum(['added', 'removed', 'modified']),
  attentionLevel: z.enum(['low', 'medium', 'high']),
  plainLanguageExplanation: z.string(),
  sourceDocA: DiffSourceAnchorSchema.optional(),
  sourceDocB: DiffSourceAnchorSchema.optional(),
});

export const CompareResponseSchema = z.object({
  summaryOverview: z.string(),
  materialChanges: z.array(MaterialChangeSchema),
  disclaimer: z.string(),
});

export const CompareRequestSchema = z.object({
  docAName: z.string().optional().default('Document A'),
  docAText: z.string().min(1, 'Document A text is required.'),
  docBName: z.string().optional().default('Document B'),
  docBText: z.string().min(1, 'Document B text is required.'),
  skipCache: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
});

export type CompareRequest = z.infer<typeof CompareRequestSchema>;

export const AnalyzeRequestSchema = z.object({
  step: z.enum(['all', 'summary', 'clauses']).optional().default('all'),
  skipCache: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
  document: z.object({
    id: z.string().optional(),
    fileName: z.string().optional(),
    fileType: z.string().optional(),
    uploadedAt: z.string().optional(),
    rawText: z.string().min(1, 'Valid document structure with text is required.'),
    sections: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        originalText: z.string(),
      }).passthrough()
    ).min(1, 'Valid document structure with sections is required.'),
  }).passthrough(),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const ChatRequestSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty.').max(2000, 'Question exceeds maximum length.'),
  chunks: z.array(
    z.object({
      text: z.string(),
    }).passthrough()
  ).min(1, 'Document chunks are required for Q&A.'),
  rawText: z.string().optional().default(''),
  skipCache: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ExportRequestSchema = z.object({
  format: z.enum(['pdf', 'markdown']),
  document: z.object({
    fileName: z.string().min(1, 'Valid document object is required.'),
  }).passthrough(),
});

export type ExportRequest = z.infer<typeof ExportRequestSchema>;


