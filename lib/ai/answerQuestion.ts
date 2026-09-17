import { DocumentChunk } from '@/types/document';
import { ChatMessage, Citation } from '@/types/chat';
import { createChatCompletion, extractJsonFromResponse } from './nvidia';
import { SYSTEM_PROMPT } from '../prompts/system';
import { DOCUMENT_QA_PROMPT } from '../prompts/qa';
import { QAResponseSchema } from '../validation/clauseSchema';
import { retrieveRelevantChunks, formatChunksForPrompt } from '../retrieval/search';
import { validateAndLinkCitations } from '../validation/citationValidator';
import { LEGAL_DISCLAIMER } from '../constants';

import { sessionAnalysisCache } from '../cache/analysisCache';

const OUT_OF_SCOPE_MESSAGE = "I couldn't find that information in the uploaded document.";

export interface AnswerQuestionOptions {
  customApiKey?: string;
  skipCache?: boolean;
}

export async function answerDocumentQuestion(
  question: string,
  chunks: DocumentChunk[],
  rawText: string,
  customApiKeyOrOptions?: string | AnswerQuestionOptions
): Promise<ChatMessage> {
  const options: AnswerQuestionOptions =
    typeof customApiKeyOrOptions === 'string'
      ? { customApiKey: customApiKeyOrOptions }
      : customApiKeyOrOptions || {};

  const customApiKey = options.customApiKey;
  const skipCache = options.skipCache ?? false;

  // 1. Retrieve top-k relevant chunks
  const scoredChunks = retrieveRelevantChunks(question, chunks, 5);

  // If score of best chunk is virtually zero and chunks exist, it's likely completely unrelated
  if (scoredChunks.length === 0 || (scoredChunks[0].score <= 0.05 && chunks.length > 0)) {
    return {
      id: `msg-${Date.now()}`,
      sender: 'assistant',
      text: OUT_OF_SCOPE_MESSAGE,
      citations: [],
      timestamp: new Date().toISOString(),
      isOutOfScope: true,
      disclaimer: LEGAL_DISCLAIMER,
    };
  }

  const contextText = formatChunksForPrompt(scoredChunks);
  const cacheKey = `qa-context:${sessionAnalysisCache.computeHash(question.trim().toLowerCase() + ':::' + contextText)}`;

  if (!skipCache) {
    const cachedResponse = sessionAnalysisCache.get<ChatMessage>(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  const rawTextOutput = await createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: DOCUMENT_QA_PROMPT(question, contextText) },
    ],
    temperature: 0.0,
    max_tokens: 1500,
    customApiKey,
  });

  const parsedJson = extractJsonFromResponse(rawTextOutput);
  const validated = QAResponseSchema.parse(parsedJson);

  // If model determined it's out of scope or couldn't find it
  if (validated.isOutOfScope || validated.answer.includes("couldn't find that information")) {
    return {
      id: `msg-${Date.now()}`,
      sender: 'assistant',
      text: OUT_OF_SCOPE_MESSAGE,
      citations: [],
      timestamp: new Date().toISOString(),
      isOutOfScope: true,
      disclaimer: LEGAL_DISCLAIMER,
    };
  }

  // 2. Validate and link citations against actual chunks and text
  const { verifiedCitations } = validateAndLinkCitations(
    validated.citations.map((c) => ({
      sectionId: '',
      sectionTitle: c.sectionTitle,
      quote: c.quote,
      relevanceExplanation: c.relevanceExplanation,
    })),
    chunks,
    rawText
  );

  // If model answered affirmatively but failed to provide any verifiable citation from the document
  if (verifiedCitations.length === 0) {
    // Check if the top retrieved chunk can serve as source
    const bestChunk = scoredChunks[0]?.chunk;
    if (bestChunk) {
      verifiedCitations.push({
        sectionId: bestChunk.sectionId,
        sectionTitle: bestChunk.sectionTitle,
        quote: bestChunk.text.slice(0, 150) + '...',
        chunkId: bestChunk.chunkId,
      });
    } else {
      return {
        id: `msg-${Date.now()}`,
        sender: 'assistant',
        text: OUT_OF_SCOPE_MESSAGE,
        citations: [],
        timestamp: new Date().toISOString(),
        isOutOfScope: true,
        disclaimer: LEGAL_DISCLAIMER,
      };
    }
  }

  const chatResponse: ChatMessage = {
    id: `msg-${Date.now()}`,
    sender: 'assistant',
    text: validated.answer,
    citations: verifiedCitations,
    timestamp: new Date().toISOString(),
    isOutOfScope: false,
    disclaimer: LEGAL_DISCLAIMER,
  };

  sessionAnalysisCache.set(cacheKey, chatResponse);
  return chatResponse;
}
