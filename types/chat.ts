export interface Citation {
  sectionId: string;
  sectionTitle: string;
  quote: string;
  chunkId?: string;
  relevanceExplanation?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  citations: Citation[];
  timestamp: string;
  isOutOfScope?: boolean;
  disclaimer: string;
}
