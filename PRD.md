# PRD.md — LegalLens: GenAI Legal Document Assistant

## 1. Problem
Legal documents (contracts, leases, ToS, NDAs, policies) are dense, jargon-heavy,
and hard to navigate without a lawyer. Most people sign or agree to terms they
don't fully understand, and don't know what to ask a professional when they
finally do consult one.

## 2. Goal
Build a GenAI-powered web app that helps users **understand, compare, and
navigate** legal documents — without giving legal advice or replacing a
licensed attorney.

## 3. Target users
- Individuals reviewing leases, employment offers, ToS/privacy policies
- Freelancers/small business owners reviewing client contracts, NDAs, vendor agreements
- Students/early professionals with no legal budget who need a first-pass understanding

## 4. Core use cases (v1 scope)
1. **Upload & Simplify** — upload a document (PDF/DOCX/paste text), get a plain-language
   summary section by section.
2. **Clause Highlighting** — auto-detect and flag: obligations, deadlines, penalties,
   auto-renewal clauses, liability/indemnity clauses, termination conditions.
3. **Risk Flags** — classify flagged clauses as Low / Medium / High attention, with a
   one-line plain-English reason.
4. **Document Q&A** — chat interface scoped ONLY to the uploaded document(s); answers
   must cite the source clause/section.
5. **Compare Mode** — upload 2 versions of a document (e.g. old vs. new ToS, or two
   vendor contracts) and get a diff-style summary of what materially changed.
6. **Actionable Output** — generate a checklist of "questions to ask a lawyer" or
   "things to negotiate/clarify" as a downloadable PDF/Markdown.

## 5. Explicitly out of scope (v1)
- Generating new legal documents/contracts from scratch
- Any output framed as "legal advice" or a recommendation to sign/not sign
- Jurisdiction-specific legal interpretation (state/country law nuance)
- E-signature or document execution flows
- Multi-user collaboration/comments (single-user session only for v1)

## 6. Non-negotiable product guardrail
Every AI-generated output must carry a visible disclaimer: **"This is general
information, not legal advice. Consult a licensed attorney for your situation."**
This disclaimer must appear on: the summary view, the Q&A panel, and any exported
document.

## 7. Success criteria (aligned to evaluation rubric)
| Rubric area | What "good" looks like here |
|---|---|
| Code Quality | Modular services (parsing, LLM prompt layer, UI) cleanly separated; typed interfaces; consistent naming |
| Security | No document data persisted beyond session unless user opts in; sanitized file uploads; no PII sent to logs |
| Efficiency | Large docs chunked for retrieval, not stuffed whole into every prompt; caching of repeated clause analysis |
| Testing | Prompt outputs validated against fixture documents; unit tests for parsing/chunking; mocked LLM calls in CI |
| Accessibility | Screen-reader friendly, keyboard navigable, plain-language toggle, WCAG-AA color contrast, mobile responsive |

## 8. Milestones
1. Upload + parse + plain-language summary (single doc)
2. Clause detection + risk flagging
3. Document-scoped Q&A with citations
4. Compare mode (2-document diff)
5. Export (checklist / summary as PDF or Markdown)
6. Accessibility + polish pass
