# TECH_STACK.md — LegalLens

## Frontend
- **Framework:** Next.js (React, App Router) — SSR for fast first paint, good
  accessibility defaults, easy API routes for a lightweight backend
- **Styling:** Tailwind CSS + shadcn/ui — accessible component primitives
  (dialog, tabs, accordion) out of the box, less custom ARIA work
- **State:** React Query for async/server state, local React state for UI-only state

## Backend / API layer
- **Runtime:** Next.js API routes (or a small FastAPI service if heavier
  document processing is needed — e.g. OCR)
- **File parsing:**
  - PDF: `pdf-parse` / `pdfjs-dist` (text-layer PDFs) or OCR fallback (`tesseract.js`)
    for scanned docs
  - DOCX: `mammoth`
- **Chunking:** split by section/clause headings first, fall back to fixed-size
  overlapping chunks (~500 tokens) for retrieval

## AI layer
- **Model:** Claude (Sonnet-tier) via the Anthropic API for summarization,
  clause classification, and Q&A
- **Retrieval:** embed document chunks (e.g. `voyage-3` or open-source
  embeddings), store in an in-memory/vector store (start with a simple
  cosine-similarity index; upgrade to a real vector DB only if needed)
- **Prompting pattern:**
  - System prompt enforces: plain-language tone, no legal advice framing,
    always cite source clause, always include disclaimer
  - Structured output (JSON) for clause risk flags so the UI can render
    consistent badges rather than parsing free text

## Data & storage
- **Session-only by default:** uploaded documents processed in memory /
  temp storage, deleted after session unless the user explicitly opts to save
- **If persistence is added:** Postgres (metadata) + object storage (S3-compatible)
  for the raw files, encrypted at rest

## Auth (if multi-session persistence is in scope)
- Simple email/OAuth via NextAuth — keep it minimal, this is not the product's
  core value

## Testing
- **Unit:** Vitest/Jest for parsing, chunking, and utility functions
- **Prompt/LLM tests:** fixture documents with expected clause categories,
  run against mocked or recorded LLM responses so tests are deterministic
- **E2E:** Playwright for upload → summary → Q&A flow, including keyboard-only
  navigation pass

## Deployment
- Vercel (frontend + API routes) for the hackathon demo
- Environment variables for API keys — never committed, never logged

## Versions to pin
- Node 20 LTS
- Next.js 14+
- Pin the exact Anthropic SDK and embedding model versions used, so demo
  behavior is reproducible
