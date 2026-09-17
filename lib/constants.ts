export const LEGAL_DISCLAIMER =
  'This is general information, not legal advice. Consult a licensed attorney for your situation.';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

export const CLAUSE_CATEGORIES = [
  'obligations',
  'deadlines',
  'penalties',
  'auto-renewal',
  'liability',
  'indemnity',
  'termination',
  'other',
] as const;

export const ATTENTION_LEVELS = ['low', 'medium', 'high'] as const;
