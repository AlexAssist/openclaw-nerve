---
status: active
created: 2026-05-22
type: feat
title: Render LaTeX math in chat messages with KaTeX
issue: 312
plan_depth: standard
---

# feat: Render LaTeX math in chat messages with KaTeX

**Goal:** Render inline (`$x^2$`) and block (`$$...$$`) LaTeX in chat assistant output via the shared `MarkdownRenderer`, so equations display formatted instead of as raw source.

**Origin:** GitHub issue [#312](https://github.com/daggerhashimoto/openclaw-nerve/issues/312) — assistant responses with formulas like `$FoM = \frac{S}{FWHM_n + FWHM_\gamma}$` currently render as text rather than typeset math.

---

## Summary

Add three plugin dependencies (`remark-math`, `rehype-katex`, `katex`), wire them into `src/features/markdown/MarkdownRenderer.tsx` as a `rehypePlugins` entry, import `katex/dist/katex.min.css` once at the app root, and add a small theme-aware CSS shim so KaTeX colors track the existing light/dark themes. Everything goes through the single shared renderer used by chat, kanban task drawers, beads, and the file-browser markdown view, so coverage is automatic.

---

## Problem Frame

- The assistant frequently produces LaTeX in chat replies (scientific papers, math/physics, engineering, data science).
- Currently those formulas reach the user as literal `$...$` / `$$...$$` strings.
- The chat already uses `react-markdown` v10 in a single shared `MarkdownRenderer` component, with `remark-gfm` as the only plugin. There is no math handling anywhere in the stack.
- The same renderer powers other surfaces (kanban descriptions, beads viewer, file browser markdown), so adding math support once benefits every consumer.

---

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | Inline math delimited by single dollars (`$...$`) renders as typeset math when balanced and non-ambiguous (no whitespace-adjacent edge cases that look like currency). |
| R2 | Display/block math delimited by `$$...$$` renders as a centered block equation. |
| R3 | Math inside fenced code blocks (` ```...``` `) and inline code (`` `...` ``) MUST NOT be parsed as math — code stays code. |
| R4 | Invalid LaTeX (e.g., `$\frac{1$`) MUST NOT crash the renderer or break the surrounding message; it should fall back to a visible error or the raw source rather than throwing. |
| R5 | Math display respects the active app theme (light/dark) — text color contrasts the background, not hard-coded black. |
| R6 | The math renderer does not run untrusted LaTeX commands that can produce XSS (no `\href`, no `\input`, no class-injection via `\htmlClass`). |
| R7 | Bundle cost of the math feature lands inside the existing `MarkdownRenderer` lazy chunk so the initial app load is unaffected. |

---

## Scope Boundaries

### In scope
- `remark-math` + `rehype-katex` + `katex` integration in `MarkdownRenderer`.
- One global stylesheet import for KaTeX base styles.
- Theme-aware color overrides for math text.
- Vitest coverage of inline, block, code-block-exemption, and invalid-LaTeX cases.

### Not in scope
- A math input UI, equation editor, or math autocomplete.
- Server-side rendering of math (we render in the browser only).
- MathJax as an alternative engine (KaTeX is chosen — see Key Decisions).
- Streaming-aware partial-equation handling (a half-typed `$\frac{1` mid-stream is allowed to display as plain text until the closing `$` arrives; remark-math's default behavior handles this).
- Numbered equations / `\tag{}` styling beyond KaTeX defaults.

### Deferred to follow-up work
- Copy-as-LaTeX button on rendered equations (nice-to-have, separate UX).
- AsciiMath or other notations.

---

## Key Technical Decisions

### D1. KaTeX over MathJax
KaTeX is the renderer. Rationale: ~30% the bundle size of MathJax 3, synchronous rendering (no flash of un-typeset math), no async font loading races inside streamed chat messages, smaller CSS surface, and an established integration path via `rehype-katex`. MathJax's only material advantage (broader LaTeX feature coverage) is not needed for the chat use cases enumerated in the issue.

### D2. Single-dollar inline syntax enabled (remark-math default)
`remark-math` v6 enables `$...$` inline math by default. We accept this because the assistant emits single-dollar math naturally and the package already handles common false-positives:
- `$5` followed by space or punctuation is not treated as opening a math span.
- Whitespace-adjacent inner content (`$ 5 dollars $`) is not math.
- Escaped `\$` is preserved as literal.

If false positives in production prose surface, the option `singleDollarTextMath: false` is the lever — documented in `## Operational Notes` below as a fallback knob, not the initial default.

### D3. KaTeX `output: 'htmlAndMathml'` (rehype-katex default)
Keep both HTML (visual) and MathML (screen reader) trees. Bundle cost is small relative to KaTeX's JS engine, and we gain accessibility for free. The codebase's `sanitizeHtml()` (which forbids `<math>`) is applied only to `dangerouslySetInnerHTML` for highlight.js output — it does NOT run over the react-markdown tree, so the MathML tree survives. See verification in U2.

### D4. KaTeX `trust: false`, `strict: 'ignore'`, `throwOnError: false`
The three KaTeX options actually relevant to chat safety:
- `trust: false` — disable `\href`, `\includegraphics`, `\htmlClass`, `\htmlId` so untrusted LaTeX cannot inject links or class names. This is the default but we pass it explicitly so future contributors see the intent.
- `strict: 'ignore'` — unknown commands silently fall through instead of warning to console for every malformed assistant reply.
- `throwOnError: false` — render the error inline (red) rather than throwing and unmounting the message bubble (R4).

### D5. CSS imported once at the app entry, not inside the lazy chunk
`katex.min.css` is imported from `src/main.tsx` alongside `index.css`. The CSS is tiny (~24 KB minified) and importing it lazily inside `MarkdownRenderer` would cause a visible re-layout when the first equation paints. App-entry import preserves R7's spirit (the JS bundle cost still lazy-loads inside the markdown chunk) while avoiding the flash.

### D6. No math support in the input composer
The composer renders plain text; math only renders in the markdown output path. Users who want to *type* math do so in raw LaTeX and the renderer shows them the formatted version on display. Equation-editor UX is explicitly deferred.

---

## High-Level Technical Design

The integration is one prop addition to `<ReactMarkdown>` and one stylesheet import. The data flow is unchanged from today's pipeline.

```text
chat message text
  │
  ├─► MarkdownRenderer (lazy chunk)
  │     │
  │     ├─ remarkPlugins:  [remarkGfm, remarkMath, remarkStableHeadingIds]
  │     │                                ▲
  │     │                                └── parses `$...$` and `$$...$$` into math nodes
  │     ├─ rehypePlugins:  [[rehypeKatex, { strict: 'ignore', throwOnError: false, trust: false }]]
  │     │                                ▲
  │     │                                └── converts math nodes to KaTeX hast (HTML + MathML)
  │     └─ components/urlTransform: unchanged
  │
  └─► rendered React tree → DOM
        └─ KaTeX CSS (imported at src/main.tsx) styles .katex spans
```

This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.

---

## Implementation Units

### U1. Add the three runtime dependencies

**Goal:** Install `remark-math`, `rehype-katex`, and `katex` at compatible versions.

**Requirements:** R1, R2, R3, R4, R7.

**Dependencies:** none.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (generated)

**Approach:**
- `remark-math` v6.x — current major, ESM-only, compatible with `react-markdown` v10.
- `rehype-katex` v7.x — current major, peer-depends on `katex` v0.16+.
- `katex` v0.16.x — pin minor to track upstream security fixes; KaTeX has released patches for XSS in past 0.16.x versions.
- Use `npm install --save remark-math@^6 rehype-katex@^7 katex@^0.16` (or the project's equivalent install command — the README/contributing docs are the source of truth on package manager).

**Patterns to follow:** existing devDependencies in `package.json` show the repo uses `^` ranges. Stay consistent.

**Test scenarios:** none — pure dependency change. Verified by U2's tests which fail-to-import if the deps aren't present.

**Verification:**
- `package.json` lists all three new deps under `dependencies` (not `devDependencies` — they ship to the client).
- `npm install` (or repo equivalent) completes without peer-dep warnings against `react-markdown@10`.

### U2. Wire `remark-math` and `rehype-katex` into `MarkdownRenderer`

**Goal:** Pass the math plugins into the existing `<ReactMarkdown>` and configure KaTeX with the security/UX options from D4.

**Requirements:** R1, R2, R3, R4, R6.

**Dependencies:** U1.

**Files:**
- Modify: `src/features/markdown/MarkdownRenderer.tsx`

**Approach:**
- Import `remarkMath` from `remark-math` and `rehypeKatex` from `rehype-katex` at the top of the file.
- Extend the existing `remarkPlugins` array on `<ReactMarkdown>` to `[remarkGfm, remarkMath, remarkStableHeadingIds]`. Order: `remarkMath` after `remarkGfm` and before `remarkStableHeadingIds` (math nodes should be created before heading-id stabilization runs, though the order is not behavior-critical for math).
- Add a new `rehypePlugins` prop on `<ReactMarkdown>`: `rehypePlugins={[[rehypeKatex, { strict: 'ignore', throwOnError: false, trust: false }]]}` — note the nested array; `react-markdown` accepts `[plugin, options]` tuples this way.
- Do not touch the existing `components`, `urlTransform`, or `sanitizeHtml` integration. The current `code` component already handles fenced/inline code and `remark-math` will not produce math nodes inside code (R3 is satisfied by upstream behavior).
- Verify the resulting hast tree is not passed through `sanitizeHtml()` anywhere. A grep of `MarkdownRenderer.tsx` confirms `sanitizeHtml` is only called inside the `code` component for `hljs` output. KaTeX HTML+MathML survive.

**Patterns to follow:** the existing `remarkPlugins={[remarkGfm, remarkStableHeadingIds]}` line at the bottom of `MarkdownRenderer.tsx` is the exact pattern to extend.

**Test scenarios:** see U4.

**Verification:**
- A chat message containing `$x^2 + y^2 = z^2$` renders a `.katex` element in the DOM, not the literal source.
- A chat message containing ` ```python\nprice = $5\n``` ` renders a `<pre><code>` block whose text content includes `$5` literally (R3).
- A chat message containing `$\frac{1$` (malformed) renders without throwing; either the inline error span or the raw source is shown (R4).

### U3. Import KaTeX base stylesheet at the app entry

**Goal:** Make KaTeX's typography and layout CSS available globally so equations paint without a relayout flash on first appearance.

**Requirements:** R5, R7.

**Dependencies:** U1.

**Files:**
- Modify: `src/main.tsx`

**Approach:**
- Add `import 'katex/dist/katex.min.css';` adjacent to the existing `import './index.css'` (line 11). Order: KaTeX first, then `index.css`, so theme overrides in `index.css` (added in U4) win the cascade.
- The KaTeX CSS uses relative `url(...)` references for math fonts (`KaTeX_Math-Italic.woff2`, etc.). Vite resolves these via its asset handling. Confirm `vite.config.ts` does not have an `assetsInclude` setting that excludes `.woff2`.

**Patterns to follow:** `src/main.tsx` already imports `index.css` at module scope — this is the convention.

**Test scenarios:** none — pure stylesheet import. Verified manually in U6 (browser smoke).

**Verification:**
- `npm run build` succeeds and `dist/` contains KaTeX font files (`KaTeX_*.woff2`).
- Local dev server (`npm run dev`) loads the page without a CSS 404 in the network panel for KaTeX fonts.

### U4. Vitest coverage for math rendering

**Goal:** Lock in the inline, block, code-exemption, and malformed-LaTeX behaviors so a regression in any of the three new deps breaks a test rather than a user's chat.

**Requirements:** R1, R2, R3, R4.

**Dependencies:** U2, U3.

**Files:**
- Modify: `src/features/markdown/MarkdownRenderer.test.tsx`

**Approach:**
- Add a `describe('math rendering', ...)` block at the bottom of the existing test file.
- Reuse the existing test setup (the file already mocks `@/lib/highlight`, `@/lib/sanitize`, and `CodeBlockActions`). KaTeX itself should NOT be mocked — we want to exercise the real plugin to catch peer-dep regressions.
- The KaTeX CSS import in `src/main.tsx` is not loaded by the Vitest jsdom setup; the tests assert on DOM structure (presence of `.katex`, `.katex-display`, `.katex-mathml`, etc.), not on computed visual styling.

**Patterns to follow:** the existing tests use `document.querySelector` / `screen.getByText`. Match that style.

**Test scenarios:**
- Covers R1. Inline `$x^2 + y^2 = z^2$` produces a `<span class="katex">` somewhere in the DOM whose text content includes `x` and `y`. (KaTeX's HTML output decomposes characters into multiple spans; assert presence of `.katex` class, not exact text.)
- Covers R2. Block `$$\int_0^1 x \, dx$$` produces a `<span class="katex-display">` element wrapping a `<span class="katex">`.
- Covers R3 (code fence exemption). The source `` ```python\nprice = $5\nother = $10\n``` `` renders a `<pre>` whose text content contains `$5` and `$10` literally, and NO `.katex` element appears in the document.
- Covers R3 (inline code exemption). The source `` Use the `$variable` syntax `` renders a `<code>` whose text content is `$variable`, and no `.katex` element appears.
- Covers R4 (graceful failure). The source `$\frac{1$` (unterminated) does not throw during render. Either a `.katex-error` element is present, or the original `$\frac{1$` text is shown verbatim. Use `expect(() => render(...)).not.toThrow()` as the primary assertion and a presence check as the secondary.
- Covers D2 (currency false-positive). The source `Bought it for $5 yesterday and $10 today` does not produce a `.katex` element — verifies the single-dollar parser's whitespace heuristic protects normal prose.
- Pre-existing tests in the file still pass — re-run the full `describe('MarkdownRenderer')` to confirm.

**Verification:**
- `npm test -- src/features/markdown/MarkdownRenderer.test.tsx` passes all new and existing assertions.
- The full repo test suite (`npm test`) does not regress.

### U5. Theme-aware color overrides for KaTeX text

**Goal:** Make rendered math respect the app's light/dark theme instead of KaTeX's default hardcoded text colors.

**Requirements:** R5.

**Dependencies:** U3.

**Files:**
- Modify: `src/index.css`

**Approach:**
- After the KaTeX import (from U3), add a small CSS block scoped to `.katex, .katex-display` that sets `color: inherit` so math text picks up the parent message bubble's foreground color.
- Set `.katex-display` margin to match the surrounding markdown block rhythm (the markdown content has its own paragraph spacing; KaTeX's default `margin: 1em 0` may double up).
- Do NOT override KaTeX's internal font selectors — those load math glyphs and are needed for correct rendering.
- The `.katex-error` class (rendered when `throwOnError: false`) should use the app's existing error/destructive color token, not KaTeX's default `#cc0000`.

**Patterns to follow:** `src/index.css` already contains scoped overrides for `.markdown-content` and `.hljs`. Add the KaTeX overrides next to those for discoverability.

**Test scenarios:** none — visual-only change, covered by U6 browser verification.

**Verification:**
- Toggle light/dark theme in the running app with a chat message containing math; the math text contrast tracks the rest of the message.
- A malformed-LaTeX render shows the error in the app's existing destructive color, not a hard-coded red.

### U6. Browser smoke verification

**Goal:** Confirm end-to-end that a chat message containing the exact example from issue #312 renders as typeset math in the actual app.

**Requirements:** R1, R2, R5, R7.

**Dependencies:** U2, U3, U5.

**Files:** none modified.

**Approach:**
- Start the dev server.
- Open a chat session and send (or seed) a message containing both:
  - the issue's example, `$FoM = \frac{S}{FWHM_n + FWHM_\gamma}$` (inline)
  - a block equation, `$$\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$$`
  - a fenced code block with `$5` text (regression check for R3)
- Verify in the browser:
  - Inline math renders as a typeset fraction, in flow with surrounding prose.
  - Block math renders as a centered display equation on its own line.
  - The code block shows `$5` literally with no `.katex` styling applied.
  - The Network panel shows the KaTeX fonts loading from the same chunk path as other static assets (no 404s).
  - Open the kanban Task drawer and confirm a math snippet in a task description also renders — proves the shared-renderer integration carries to other surfaces with zero additional work.

**Test scenarios:** verified manually; no new Vitest cases here.

**Verification:**
- The browser pass above completes with no console errors related to KaTeX, font loading, or react-markdown plugin compatibility.
- Bundle-size sanity check: `npm run build` reports the markdown chunk grew but the entry chunk did not significantly (entry should only gain the KaTeX CSS ~24 KB).

---

## System-Wide Impact

- **All four MarkdownRenderer consumers** gain math rendering automatically: `src/features/chat/MessageBubble.tsx`, `src/features/kanban/TaskDetailDrawer.tsx`, `src/features/beads/BeadViewerTab.tsx`, `src/features/file-browser/MarkdownDocumentView.tsx`. This is desired — math in a task description or a beads note is the same problem as math in a chat message.
- **Bundle**: KaTeX JS lands in the lazy `MarkdownRenderer` chunk (~280 KB minified before gzip). The KaTeX CSS at app entry adds ~24 KB. Total initial-load growth is bounded by the CSS only.
- **Security**: `trust: false` (D4) keeps the KaTeX command surface free of link injection. The existing CSP / DOMPurify boundaries are not weakened — KaTeX output is hast nodes, not raw HTML strings, and is not passed through `sanitizeHtml()`.
- **Accessibility**: `htmlAndMathml` (D3) preserves a MathML tree alongside the visual HTML. Screen readers that understand MathML get a structured equation; others fall back to the KaTeX-generated MathML text content.
- **No server changes.** Math rendering is purely client-side.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Single-dollar math false-positives in prose containing currency or shell variables | Medium | Low (visual oddity only) | D2's whitespace heuristic; documented fallback to `singleDollarTextMath: false` in U2 if user reports come in. |
| Bundle bloat regresses initial-load metrics | Low | Medium | KaTeX JS is gated to the lazy markdown chunk (R7); only CSS is in the entry. Documented in U6 sanity check. |
| Future KaTeX 0.16.x patch release introduces a breaking option | Low | Low | Pinned via `^0.16` caret, which respects patch and minor SemVer. CI catches breaks on next install. |
| KaTeX MathML stripped by an unexpected sanitizer added later | Low | Medium | `sanitizeHtml` audit in U2 documents that no sanitizer runs over the react-markdown hast tree. A future contributor adding global HTML sanitization needs to allow `math` (or rely on the HTML output only). |
| A streaming chat message arrives mid-equation (closing `$` not yet streamed) | Medium | Low | remark-math's default behavior: unmatched delimiters render as plain text. The equation typesets on the next render when the closing delimiter arrives. Acceptable; no special handling needed. |

---

## Operational Notes

- **Disable knob**: if a production issue with single-dollar false-positives surfaces, change the U2 plugin tuple to `[remarkMath, { singleDollarTextMath: false }]`. Users who want inline math will then write `$$...$$` on a single line for inline or use the block form.
- **KaTeX version updates**: keep `katex` pinned at `^0.16`. KaTeX 0.17+ has not shipped; if/when it does, bump in a separate PR after re-running U4's tests against the new version.
- **No telemetry**: this feature does not need usage telemetry — it is a passive render improvement, not a feature with opt-in or interaction surface.

---

## Verification

The plan is complete when:
- All six implementation units land.
- The Vitest suite (`npm test`) passes, including the new math test cases.
- A manual browser pass through U6 confirms inline math, block math, code-block exemption, and theme tracking all work.
- `npm run build` completes and the chunk sizes match the expectations in U6.
