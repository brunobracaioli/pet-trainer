---
id: 03-01-landing-page
sprint: 3
order: 1
status: not-started
spec_refs: ['§9.1', '§9.2', '§0', '§1.2', '§6.1']
depends_on: [01-05-auth-supabase-github]
deliverables:
  - apps/web/app/(marketing)/page.tsx
  - apps/web/app/(marketing)/layout.tsx
  - apps/web/components/install-command.tsx
  - apps/web/components/how-it-works.tsx
  - apps/web/public/demo.gif
---

## Goal

Build the fully static marketing landing page at `/` that communicates `pet-trainer`'s value proposition, delivers both install commands with copy-to-clipboard, and converts visitors to installers — without requiring authentication or any server-side data fetching.

## Context

SPEC.md §9.1 designates `/` as a static route. The page is the primary top-of-funnel surface — it appears in social shares, HackerNews, Reddit, and the npm package README. §1.2 states the hypothesis that gamified feedback accelerates Claude Code proficiency; the landing page must convey this in under 10 seconds of reading. §6.1 defines the two install paths (`npx @specops/pet-trainer init` and `pip install pet-trainer && pet-trainer init`) that must be copy-pasteable from the page. Sprint 3 begins with the landing page because it has zero data dependencies (no auth, no DB reads) and can be shipped and iterated independently of the dashboard and leaderboard.

## Implementation outline

- Declare `export const dynamic = 'force-static'` at the top of `apps/web/app/(marketing)/page.tsx` to ensure Next.js generates a fully static HTML page at build time — no server-side rendering on request (§9.1).
- Write the hero section with the product tagline from §0: **"Your pet evolves only if you actually use Claude Code."** Include a subheadline explaining the core loop in one sentence (install → code with Claude → pet evolves, quests complete, XP awarded). Below the subheadline, embed the `<InstallCommand />` component for both `npx @specops/pet-trainer init` (primary, Node) and `pip install pet-trainer && pet-trainer init` (secondary, Python). Below commands, render the demo GIF/video placeholder (`<img src="/demo.gif" alt="pet-trainer terminal demo" />`) — mark with a TODO comment that the real GIF replaces this pre-launch.
- Write the "How it works" section using the `<HowItWorks />` component (3 steps: 1. Install in 30 seconds, 2. Code normally with Claude Code, 3. Your pet evolves automatically). Each step has an icon (terminal, sparkles, heart), a title, and a 2-sentence description derived from §0 and §3.3 (HTTP hooks, fire-and-forget).
- Write a social proof placeholder section: an install counter (`npm downloads: loading...` — real counter can be a client component that fetches from npm API, or a static number updated at build time) and a GitHub stars badge link (`https://github.com/specops/pet-trainer`).
- Create `apps/web/app/(marketing)/layout.tsx` with: a `<nav>` containing the `gh0stnel` logo (text + emoji 👾 placeholder for MVP), a "Get started" CTA button that links to `#install`, and a GitHub link with the star icon. A `<footer>` with copyright, links to `/legal/privacy`, `/docs`, and the GitHub repo. This layout wraps only routes under `(marketing)/` — the `app/` root layout is untouched.
- Create `apps/web/components/install-command.tsx` as a client component (`"use client"`): renders a styled code block (`<pre><code>`) for a given command string, with a copy-to-clipboard button. On click: `navigator.clipboard.writeText(command)` + show a "Copied!" confirmation for 2 seconds. Accept `platform: 'npm' | 'pip'` as a prop to render the correct label. Use Tailwind `font-mono`, dark background, subtle border.
- Create `apps/web/components/how-it-works.tsx` as a server component: renders 3 cards in a horizontal grid (`grid-cols-1 md:grid-cols-3`), each with an SVG icon, step number, title, and description. Icons: terminal SVG for "Install", a sparkles/wand SVG for "Code", a pet SVG (simple egg shape) for "Evolve".
- Add `apps/web/public/demo.gif` as a 1×1 pixel transparent GIF placeholder (can be created with a base64-encoded data URI written to the file, or just a valid 1×1 GIF binary). Add a comment in `page.tsx` referencing where the real GIF should be dropped pre-launch.
- Export `export const metadata` from `page.tsx` with: `title: "pet-trainer — Learn Claude Code by leveling up your pet"`, `description` (from §0 tagline expanded), `openGraph.images` pointing to a placeholder OG image, and `robots: { index: true, follow: true }`.

## Files to create / modify

| Path                                      | Action | Notes                                                                                                  |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `apps/web/app/(marketing)/page.tsx`       | create | Hero + install commands + how-it-works + social proof. `force-static`. Real product copy from §0/§1.2. |
| `apps/web/app/(marketing)/layout.tsx`     | create | Nav with logo + CTA + GitHub link; footer with privacy/docs/repo links                                 |
| `apps/web/components/install-command.tsx` | create | `"use client"` — copy-to-clipboard code block, accepts `command` and `platform` props                  |
| `apps/web/components/how-it-works.tsx`    | create | Server component — 3-step grid with icons, titles, descriptions                                        |
| `apps/web/public/demo.gif`                | create | 1×1 pixel placeholder GIF; replaced with real demo pre-launch                                          |

## Verification

```bash
# Build must succeed with zero type errors
pnpm --filter @specops/web build

# Typecheck passes
pnpm --filter @specops/web typecheck

# Static export: confirm page has no server-side data fetching
grep -r "fetch\|getServerSideProps\|cookies()\|headers()" apps/web/app/\(marketing\)/page.tsx \
  && echo "WARN: possible dynamic data access" || echo "OK: fully static"

# Confirm force-static declaration present
grep "force-static" apps/web/app/\(marketing\)/page.tsx \
  && echo "OK" || echo "FAIL: missing force-static"

# Dev server: page loads at /
pnpm --filter @specops/web dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200" && echo "OK" || echo "FAIL"

# Confirm both install commands are present in the HTML
curl -s http://localhost:3000/ | grep -q "npx @specops/pet-trainer" && echo "npm OK" || echo "FAIL: npm command missing"
curl -s http://localhost:3000/ | grep -q "pip install pet-trainer" && echo "pip OK" || echo "FAIL: pip command missing"

# Confirm no placeholder text
curl -s http://localhost:3000/ | grep -qi "lorem ipsum" && echo "FAIL: placeholder text found" || echo "OK"

# Confirm OG metadata is present
curl -s http://localhost:3000/ | grep -q "og:title" && echo "OG OK" || echo "FAIL: OG tags missing"
```

## Notes / Open questions

- The `(marketing)` route group is a Next.js App Router convention — the parentheses mean it does not appear in the URL. All routes inside share `(marketing)/layout.tsx` (nav + footer) without affecting the root URL path.
- Do NOT use "Lorem ipsum" or any placeholder copy. Write real product copy derived from §0 and §1.2. The tagline "Your pet evolves only if you actually use Claude Code" is non-negotiable — it is already in marketing materials.
- The install counter social proof is optional for MVP but leave the section stub in the HTML as a comment, so it can be wired up post-launch without restructuring the page.
- The `demo.gif` is a placeholder with a TODO. The real animated GIF showing a terminal session (`pet status` output, XP bar updating, quest completion notification) should be recorded and dropped into `apps/web/public/` before launch.
- Lighthouse ≥ 90 on desktop is achievable because the page is fully static, has no client-side data fetching, and the only images are a 1×1 placeholder GIF and SVG icons. The only client component is `<InstallCommand />` which is small and non-blocking.
- The `(marketing)/layout.tsx` must NOT import from `@supabase/ssr` or do any auth check — the landing page is public and must render identically for logged-in and anonymous users. The "Get started" CTA links to `#install` (the install commands anchor), not to `/dashboard` — that avoids a jarring redirect-to-auth for non-logged-in visitors.
- `apps/web/app/layout.tsx` (root layout) handles global fonts, Tailwind base styles, and the `<html>/<body>` wrappers. The marketing layout wraps only the inner content with the marketing nav and footer, without duplicating `<html>/<body>`.
