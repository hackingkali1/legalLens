export type DiffChangeType = 'added' | 'removed' | 'modified';

export interface DiffSourceAnchor {
  sectionTitle: string;
  quote: string;
}

export interface MaterialChange {
  id: string;
  title: string;
  type: DiffChangeType;
  attentionLevel: 'low' | 'medium' | 'high';
  plainLanguageExplanation: string;
  sourceDocA?: DiffSourceAnchor;
  sourceDocB?: DiffSourceAnchor;
}

export interface DocumentDiffResult {
  docAName: string;
  docBName: string;
  summaryOverview: string;
  materialChanges: MaterialChange[];
  disclaimer: string;
}
