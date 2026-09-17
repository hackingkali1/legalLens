'use client';

import React from 'react';
import { DocumentChunk } from '@/types/document';
import { ChatInterface } from '../chat/ChatInterface';

export interface DocumentQATabProps {
  chunks: DocumentChunk[];
  rawText: string;
  chatInitialQuery: string;
  onJumpToCitation: (sectionTitle: string, quote: string) => void;
}

export function DocumentQATab({
  chunks,
  rawText,
  chatInitialQuery,
  onJumpToCitation,
}: DocumentQATabProps) {
  return (
    <div className="flex-1 overflow-hidden min-h-0">
      <ChatInterface
        chunks={chunks}
        rawText={rawText}
        onJumpToCitation={onJumpToCitation}
        initialInput={chatInitialQuery}
      />
    </div>
  );
}
