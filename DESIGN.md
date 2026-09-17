# DESIGN.md — LegalLens

## Tone
Calm, clear, reassuring — the opposite of the document being reviewed. This is
a tool for someone who is likely anxious or confused about a contract. No legal
jargon in the UI itself; jargon only appears when quoting the source document,
always paired with a plain-language explanation next to it.

## Visual language
- **Palette:** neutral base (off-white / soft gray background, dark slate text)
  with a single accent color for interactive elements. Risk levels use a
  colorblind-safe traffic-light set (not pure red/green — use color + icon +
  text label together, never color alone) for Low/Medium/High risk badges.
- **Typography:** high legibility serif or humanist sans for document text
  (readability over branding), clean sans for UI chrome. Minimum 16px body text.
- **Layout:** two-pane view — original document (or plain-language summary) on
  one side, clause detail / Q&A panel on the other. Avoid dense walls of text;
  use collapsible sections per clause/heading.

## Key screens
1. **Upload** — drag/drop or paste text, clear file-type/size guidance, upfront
   disclaimer about what the tool does and doesn't do
2. **Summary view** — section-by-section plain-language summary with expandable
   "show original text" per section
3. **Clause/Risk panel** — list of flagged clauses with badge (Low/Med/High),
   one-line reason, jump-to-source link
4. **Q&A panel** — chat scoped to the document, each answer shows a citation
   chip linking back to the exact clause
5. **Compare view** — side-by-side or unified diff of two documents, changes
   highlighted with a plain-language "what this means" note
6. **Export/Checklist** — generated list of questions/next steps, downloadable

## Accessibility requirements (ties to eval rubric)
- WCAG 2.1 AA color contrast minimum throughout
- Full keyboard navigation (tab order, visible focus states, no keyboard traps)
- Screen-reader labels on all icon-only buttons and risk badges (not color-only signal)
- Resizable/zoomable text without breaking layout
- Plain-language mode as a first-class toggle, not an afterthought
- Support for reduced-motion preference (no unnecessary animation)
- Mobile-responsive: usable one-handed on a phone for quick document checks

## What NOT to design
- No dark-pattern styling nudging users toward any particular decision
- No visual treatment that makes AI output look like an official legal
  determination (avoid seals, checkmarks-as-approval, etc.) — the disclaimer
  must be visually present, not buried in fine print
