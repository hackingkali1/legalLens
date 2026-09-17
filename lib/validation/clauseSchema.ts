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

