export type ClauseCategory =
  | 'obligations'
  | 'deadlines'
  | 'penalties'
  | 'auto-renewal'
  | 'liability'
  | 'indemnity'
  | 'termination'
  | 'other';

export type AttentionLevel = 'low' | 'medium' | 'high';

export interface ClauseItem {
  id: string;
  category: ClauseCategory;
  attentionLevel: AttentionLevel;
  title: string;
  reason: string;
  plainLanguageExplanation: string;
  sourceSection: string;
  quote: string;
  questionForLawyer: string;
  charStart?: number;
  charEnd?: number;
}

export interface LawyerChecklistItem {
  id: string;
  clauseId?: string;
  type: 'question' | 'negotiation';
  text: string;
  context: string;
  sourceSection: string;
}
