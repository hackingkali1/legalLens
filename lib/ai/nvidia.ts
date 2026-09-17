import { jsonrepair } from 'jsonrepair';

export const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const DEFAULT_MODEL = 'nvidia/llama-3.1-nemotron-70b-instruct';

// Active Nemotron and instruct fallback candidates on NVIDIA NIM
const FALLBACK_MODELS = [
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'openai/gpt-oss-20b',
];

export function getNvidiaModel(): string {
  return process.env.NVIDIA_MODEL || DEFAULT_MODEL;
}

export class NvidiaApiError extends Error {
  status: number;
  statusCode: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'NvidiaApiError';
    this.status = status;
    this.statusCode = status;
  }
}

import fs from 'fs';
import path from 'path';

function loadLocalEnvKey(): string | undefined {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^NVIDIA_API_KEY\s*=\s*(.+)$/m);
      if (match && match[1]) {
        const val = match[1].trim().replace(/\r/g, '').replace(/^['"]|['"]$/g, '');
        if (val.length > 0 && val !== 'your_nvidia_api_key_here') {
          return val;
        }
      }
    }
  } catch {
    // Ignore error
  }
  return undefined;
}

export function getNvidiaApiKey(customApiKey?: string): string {
  let key = customApiKey || loadLocalEnvKey() || process.env.NVIDIA_API_KEY;

  if (!key || key.trim().length === 0 || key === 'your_nvidia_api_key_here') {
    throw new Error(
      'NVIDIA_API_KEY is not configured. Please add your NVIDIA API key to .env.local or enter it in the session settings.'
    );
  }

  // Strip carriage returns, quotes, and whitespace from Windows .env parsing
  key = key.trim().replace(/\r/g, '').replace(/^['"]|['"]$/g, '');
  return key;
}

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessageParam[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  customApiKey?: string;
  responseFormat?: { type: 'json_object' };
}

async function tryCallNvidiaModel(
  model: string,
  options: ChatCompletionOptions,
  apiKey: string
): Promise<{ success: boolean; content?: string; errorStatus?: number; errorDetail?: string }> {
  try {
    const payload: Record<string, unknown> = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.max_tokens ?? 4000,
    };

    if (options.responseFormat) {
      payload.response_format = options.responseFormat;
    }

    let response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // If model rejects response_format with 400, retry once without response_format
    if (!response.ok && response.status === 400 && options.responseFormat) {
      delete payload.response_format;
      response = await fetch(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errBody = await response.json();
        // NVIDIA returns { status, title, detail } or { error: { message, code } }
        errorDetail =
          errBody?.detail ||
          errBody?.error?.message ||
          errBody?.title ||
          JSON.stringify(errBody);
      } catch {
        errorDetail = await response.text();
      }
      return { success: false, errorStatus: response.status, errorDetail };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      return { success: true, content };
    }

    return { success: false, errorDetail: 'Empty response choices returned from NVIDIA NIM' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, errorDetail: message };
  }
}

/**
 * Unified internal LLM service calling NVIDIA's OpenAI-compatible completions API.
 * Uses process.env.NVIDIA_API_KEY (or session key), and process.env.NVIDIA_MODEL.
 */
export async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const apiKey = getNvidiaApiKey(options.customApiKey);
  const requestedModel = options.model || getNvidiaModel();

  // Model cascade: requested model followed by active verified Nemotron fallbacks
  const modelCandidates = [
    requestedModel,
    ...FALLBACK_MODELS.filter((m) => m !== requestedModel),
  ];

  let lastErrorDetail = '';
  let lastStatus = 0;

  for (const candidate of modelCandidates) {
    const res = await tryCallNvidiaModel(candidate, options, apiKey);
    if (res.success && res.content) {
      return res.content;
    }

    lastStatus = res.errorStatus || 0;
    lastErrorDetail = res.errorDetail || 'Unknown error';

    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[NVIDIA NIM Debug] candidate=${candidate}, status=${lastStatus}, detail=${lastErrorDetail}`);
    }

    // If 401 Unauthorized (token format invalid), fail immediately
    if (lastStatus === 401) {
      throw new NvidiaApiError(
        `NVIDIA_API_KEY is invalid or unauthorized (status 401): ${lastErrorDetail || 'Invalid credentials'}`,
        401
      );
    }

    console.warn(
      `[NVIDIA NIM] Model ${candidate} failed (${lastStatus}: ${lastErrorDetail}). Trying fallback model...`
    );
  }

  // If all models in cascade failed, provide clean human-readable error with status code
  if (lastStatus === 401 || lastStatus === 403) {
    throw new NvidiaApiError(
      `NVIDIA_API_KEY is unauthorized for requested models (status ${lastStatus}): ${lastErrorDetail}`,
      lastStatus
    );
  }

  if (lastStatus === 429) {
    throw new NvidiaApiError(
      `NVIDIA NIM rate limit or quota exceeded (status 429): ${lastErrorDetail || 'Too many requests'}`,
      429
    );
  }

  if (lastStatus === 503) {
    throw new NvidiaApiError(
      `NVIDIA NIM service unavailable or overloaded (status 503): ${lastErrorDetail || 'Service temporarily unavailable'}`,
      503
    );
  }

  throw new NvidiaApiError(
    `NVIDIA NIM API error (status ${lastStatus}): ${lastErrorDetail}`,
    lastStatus
  );
}

/**
 * Sanitizes model text prior to JSON parsing:
 * 1. Strips markdown code fences (```json ... ``` or ``` ... ```)
 * 2. Extracts substring between outermost { } or [ ]
 * 3. Normalizes smart/curly quotes inside string values and delimiters without corrupting document text
 */
export function sanitizeJsonString(raw: string): string {
  let text = raw.trim();

  // 1. Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  }

  // 2. Extract outermost JSON bounds: { ... } or [ ... ]
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');

  let startIdx = -1;
  let endIdx = -1;

  const hasBraces = firstBrace !== -1 && lastBrace > firstBrace;
  const hasBrackets = firstBracket !== -1 && lastBracket > firstBracket;

  if (hasBraces && hasBrackets) {
    if (firstBrace < firstBracket && lastBrace > lastBracket) {
      startIdx = firstBrace;
      endIdx = lastBrace;
    } else {
      startIdx = firstBracket;
      endIdx = lastBracket;
    }
  } else if (hasBraces) {
    startIdx = firstBrace;
    endIdx = lastBrace;
  } else if (hasBrackets) {
    startIdx = firstBracket;
    endIdx = lastBracket;
  }

  if (startIdx !== -1 && endIdx !== -1) {
    text = text.slice(startIdx, endIdx + 1);
  }

  // 3. Normalize single smart quotes ‘ and ’ to standard '
  text = text.replace(/[\u2018\u2019]/g, "'");

  // Normalize double smart quotes “ and ” to standard "
  text = text.replace(/[\u201C\u201D]/g, '"');

  return text.trim();
}

export interface ExtractJsonOptions {
  maxTokens?: number;
}

/**
 * Robust JSON extraction pipeline for LLM outputs:
 * Sanitizes code fences, commentary, smart quotes, attempts strict JSON.parse,
 * and falls back to jsonrepair for truncated or malformed LLM objects.
 */
export function extractJsonFromResponse<T = unknown>(
  rawResponseText: string,
  options?: ExtractJsonOptions
): T {
  const isDev = process.env.NODE_ENV !== 'production';

  if (!rawResponseText || rawResponseText.trim().length === 0) {
    throw new Error('Failed to parse AI structured response as JSON: Model returned an empty response.');
  }

  // Reject plain conversational prose that contains no JSON opening brackets
  if (rawResponseText.indexOf('{') === -1 && rawResponseText.indexOf('[') === -1) {
    throw new Error(
      `Failed to parse AI structured response as JSON: Model returned plain text without JSON brackets (${rawResponseText.slice(0, 100)}).`
    );
  }

  // Truncation detection & dev logging
  if (isDev && options?.maxTokens) {
    const rawLen = rawResponseText.length;
    const approxTokens = rawLen / 3.8;
    if (approxTokens >= options.maxTokens * 0.85) {
      console.warn(
        `[NVIDIA NIM Truncation Warning] Response length (${rawLen} chars, ~${Math.round(approxTokens)} tokens) approaches max_tokens (${options.maxTokens}). JSON may be truncated.`
      );
    }
  }

  const sanitized = sanitizeJsonString(rawResponseText);

  const validateParsed = (val: unknown): T => {
    if (val === null || typeof val !== 'object') {
      throw new Error('Model returned a primitive value instead of a structured JSON object/array.');
    }
    return val as T;
  };

  // Attempt 1: Strict JSON.parse on sanitized string
  try {
    return validateParsed(JSON.parse(sanitized));
  } catch {
    // Fall through to lenient repair
  }

  // Attempt 2: jsonrepair on sanitized candidate (fixes unclosed brackets, missing commas, unescaped quotes)
  try {
    const repaired = jsonrepair(sanitized);
    return validateParsed(JSON.parse(repaired));
  } catch {
    // Continue
  }

  // Attempt 3: jsonrepair on raw response in case brace boundaries cut off valid fields
  try {
    const repairedRaw = jsonrepair(rawResponseText);
    return validateParsed(JSON.parse(repairedRaw));
  } catch {
    // Both strict and lenient parsing failed
  }

  throw new Error(
    'Failed to parse AI structured response as JSON: Model response could not be parsed into valid structured format.'
  );
}

export interface StructuredCompletionOptions extends ChatCompletionOptions {
  onRetry?: (attempt: number, reason: string) => void;
}

/**
 * Executes a chat completion requesting structured JSON with an automatic retry loop.
 * If the first completion returns invalid or truncated JSON, sends a follow-up corrective prompt.
 */
export async function createStructuredCompletion<T = unknown>(
  options: StructuredCompletionOptions
): Promise<T> {
  const isDev = process.env.NODE_ENV !== 'production';
  const messages = [...options.messages];
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rawResponse = await createChatCompletion({
      ...options,
      messages,
      responseFormat: { type: 'json_object' },
    });

    try {
      return extractJsonFromResponse<T>(rawResponse, {
        maxTokens: options.max_tokens,
      });
    } catch (parseErr: unknown) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      if (attempt < maxAttempts) {
        if (isDev) {
          console.warn(
            `[NVIDIA NIM Structured Retry] Attempt ${attempt} failed JSON parsing. Retrying with corrective prompt. Reason: ${errMsg}`
          );
        }
        options.onRetry?.(attempt, errMsg);

        messages.push({
          role: 'assistant',
          content: rawResponse.slice(0, 2000),
        });
        messages.push({
          role: 'user',
          content:
            'Your previous response was not valid JSON or was cut off. Return ONLY the valid JSON object matching the required schema, without any markdown code fences, thought process, or commentary.',
        });
      } else {
        throw parseErr;
      }
    }
  }

  throw new Error('Failed to parse AI structured response as JSON after retry.');
}
