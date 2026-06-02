<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:orbien-enforcement -->
# Hard stops — STOP AND FIX, do not adjust or work around

These are non-negotiable. If you are about to violate one, or you spot one already in the code, stop and correct it before doing anything else.

## 1. Do not recreate the scaffold
`layout.tsx`, `globals.css`, `Header.tsx`, `Footer.tsx`, and any file that already exists are off-limits for recreation. Read the file before touching it. Recreating existing files destroys accumulated decisions and causes merge conflicts.
**Catch:** before creating any file, check if it exists. If it does, edit — never overwrite.

## 2. No hardcoded colors
Hex values (`#1E3A7B`), `rgb(…)`, `rgba(…)`, or CSS named colors in JSX/TSX are forbidden.
Use only:
- CSS variables already defined in `globals.css`: `style={{ color: "var(--navy-accent)" }}`
- Tailwind utilities generated from the `@theme` block: `bg-navy`, `text-teal`, `border-border`
**Catch:** grep for `#[0-9a-fA-F]` or `rgb(` inside any `.tsx` or `.ts` file you touch. Remove and replace with the correct token.

## 3. No raw HTML inside components
No `dangerouslySetInnerHTML`, no copy-pasted HTML string literals, no bare `<div style="…">` blobs copied from a browser. All UI is JSX composed from named components or Tailwind utilities.
**Catch:** if you are about to paste a block of HTML markup as-is, stop — extract meaningful pieces into named sub-components or primitives first.

## 4. DM Sans and DM Mono only
The only permitted font families are `DM Sans` (Tailwind utility: `font-sans`) and `DM Mono` (`font-mono`). Both are already loaded in `layout.tsx` via `next/font`. Do not import or reference any other typeface.
**Catch:** grep for `font-family`, `@import url`, or any Google Fonts `<link>` that isn't DM Sans / DM Mono.

## 5. No localStorage or sessionStorage
This is a static marketing site. There is no auth, no cart, no persistent user state. `localStorage`, `sessionStorage`, `document.cookie`, and `IndexedDB` are off-limits.
**Catch:** if logic requires remembering something between page loads, question whether it belongs in this repo at all. In-memory React state (`useState`) is fine for ephemeral UI state.

## 6. Static only — no SSR, no dynamic data fetching
Every page must render to static HTML at build time. Forbidden:
- `export const dynamic = "force-dynamic"` or `"auto"` on pages
- `fetch(…)` inside a Server Component without `{ cache: "force-cache" }` or a build-time data source
- Any database query, API call, or external HTTP request at request time
- Route Handlers that return user-specific or time-varying data

**Catch:** if a page needs real-time data, it does not exist yet in this project. Flag it and wait for instructions.
<!-- END:orbien-enforcement -->
