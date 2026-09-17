# CONSTRAINTS.md — LegalLens

## Product/legal guardrails (hard constraints — do not remove or soften)
1. The app **provides information, not advice**. No output may be phrased as
   a recommendation ("you should sign this", "this is illegal", "you will win
   this case"). Rephrase as: "this clause typically means X — consider asking
   a lawyer whether Y applies to your situation."
2. Every summary, Q&A answer, risk flag, and export must display the
   disclaimer: "This is general information, not legal advice. Consult a
   licensed attorney for your situation."
3. Q&A must be **document-scoped only** — do not let the model answer general
   legal questions unrelated to the uploaded document, and do not let it
   speculate about jurisdiction-specific law it wasn't given.
4. No jurisdiction-specific legal conclusions (e.g. "this violates California
   law") unless the user explicitly provides that context, and even then,
   frame as "may be worth checking against [jurisdiction] law with a
   professional," not as a determination.
5. Do not fabricate clauses, sections, or quotes. Every claim the model makes
   about the document must be traceable to an actual chunk of the source text
   (citation-required prompting + a verification/guard step before rendering).

## Security constraints
- Never log full document contents or PII in application logs
- Uploaded files scanned for type/size before parsing; reject executables/scripts
- API keys and secrets via environment variables only, never hardcoded or
  committed
- If documents are persisted, encrypt at rest and give users a clear delete option
- Sanitize any user-supplied text before it's rendered back as HTML (XSS)

## Engineering constraints
- No new dependencies added without checking bundle size / license compatibility
- Keep LLM calls chunked/batched for large documents — never blindly paste an
  entire large document into a single prompt
- All LLM-facing prompts live in one central prompt module, not scattered
  inline strings, so tone/guardrails stay consistent and are easy to audit
- Every feature ships with at least one test (unit or fixture-based) before
  being marked done

## Scope constraints (v1)
- Single-user session only — no multi-user collaboration
- No e-signature, contract generation, or document execution features
- No integrations with external legal databases/case law search in v1
