import { ClauseItem, LawyerChecklistItem } from './clause';

export interface DocumentSection {
  id: string;
  sectionNumber?: string;
  title: string;
  originalText: string;
  plainLanguageSummary: string;
  keyPoints: string[];
  startIndex: number;
  endIndex: number;
  flagCount?: {
    low: number;
    medium: number;
    high: number;
  };
}

export interface DocumentChunk {
  chunkId: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  charStart: number;
  charEnd: number;
  tokenEstimate: number;
}

export interface DocumentSummary {
  overview: string;
  documentType: string;
  mainParties?: string[];
  effectiveDateOrTerm?: string;
  keyTakeaways: string[];
  disclaimer: string;
}

export interface LegalLensDocument {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: 'pdf' | 'docx' | 'txt';
  uploadedAt: string;
  rawText: string;
  sections: DocumentSection[];
  chunks: DocumentChunk[];
  summary?: DocumentSummary;
  clauses: ClauseItem[];
  lawyerChecklist: LawyerChecklistItem[];
}
