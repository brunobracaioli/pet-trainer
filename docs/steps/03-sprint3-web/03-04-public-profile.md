---
id: 03-04-public-profile
sprint: 3
order: 4
status: not-started
spec_refs: ['§9.1', '§9.3', '§5.1', '§1.2', '§7.3']
depends_on: [01-05-auth-supabase-github]
deliverables:
  - apps/web/app/u/[username]/page.tsx
  - apps/web/app/u/[username]/badge.svg/route.ts
  - apps/web/app/u/[username]/opengraph-image.tsx
---

## Goal

Build the public profile page at `/u/[username]` that displays a user's pet, XP, and completed quest badges, and generate a self-contained badge SVG at `/u/[username]/badge.svg` that developers can embed in their GitHub README — the primary viral growth mechanic described in §1.2.

## Context

SPEC.md §9.1 designates `/u/[username]` as RSC with ISR (revalidate 60s). §9.3 specifies exactly what the public profile must show: pet sprite + name + stage, XP total + leaderboard position, completed quest badges, and the README badge markdown copy block. §1.2 identifies the embeddable badge as the core organic growth vector — developers who add `![pet-trainer](https://pet.specops.black/u/{username}/badge.svg)` to their README expose the product to thousands of GitHub profile visitors. The badge SVG must therefore be: correct Content-Type, self-contained (no external resources), cacheable (1 hour), and visually informative at small sizes. The "public profiles readable" RLS policy in §5.1 (`CREATE POLICY "public profiles readable" ON public.profiles FOR SELECT USING (true)`) is already applied by step `01-02`, so profile data is accessible without auth from Supabase.

## Implementation outline

- Create `apps/web/app/u/[username]/page.tsx` as an RSC with `export const revalidate = 60`. Accept `params: { username: string }` from the App Router. Fetch profile by `username` from the `profiles` table using the Supabase service client (the "public profiles readable" RLS policy allows this without auth, but using the service client is simpler and avoids cookie management in this public-facing route). If no row is found, call `notFound()` from `next/navigation` to render the Next.js 404 page. Fetch the pet associated with the profile's `owner_id` from the `pets` table. Fetch completed quests from `quest_progress WHERE user_id = profile.id AND status = 'completed'` joined with `quests` to get title + category.
- In the page, render: (1) pet sprite (`stage` → SVG emoji or inline SVG from §7.3 mapping: 1→🥚, 2→👶, 3→🧒, 4→🥷, 5→🧙) + pet name + stage label text; (2) XP total formatted with `toLocaleString()` + leaderboard position (fetch rank via `ZREVRANK lb:global:alltime {user_id}` from Upstash Redis, add 1 for 1-based display; return "Unranked" if null); (3) completed quest badges grid — each badge is a small colored chip with the quest category icon + quest title; (4) README badge copy block: a code fence containing `![pet-trainer](https://pet.specops.black/u/{username}/badge.svg)` with a copy-to-clipboard client component wrapper.
- Export `generateMetadata` from `page.tsx` that returns dynamic `title: "[username]'s pet — pet-trainer"` and `openGraph.images: ["/u/${username}/opengraph-image"]` so OG cards show the generated OG image when the profile URL is shared on social media.
- Create `apps/web/app/u/[username]/badge.svg/route.ts` as a Node Function (not Edge — SVG string construction and Supabase fetch are simple enough, and this avoids Edge limitations on template literals with complex Unicode). Handle `GET`. Fetch profile + pet by `username` from Supabase. If not found, return `Response.json({ error: 'not found' }, { status: 404 })`. Construct the SVG string inline — no external SVG library needed. The badge SVG layout: 200px wide × 28px tall. Left section (dark background `#1a1a2e`): stage emoji + username text. Right section (accent background `#6c47ff`): XP value + "XP" label. Use only web-safe system fonts embedded via `font-family: monospace` — no external font loading. Return `new Response(svgString, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } })`.
- The badge SVG must be self-contained: no `<image href="...">` tags referencing external URLs, no `<use>` referencing external symbols, no external CSS. GitHub's Camo image proxy strips external references for security. Embed all text and shapes as literal SVG elements.
- Create `apps/web/app/u/[username]/opengraph-image.tsx` using Next.js `ImageResponse` from `next/og`. Export a default function that accepts `params: { username: string }`. Fetch profile + pet data inside the function (ImageResponse supports `fetch` at generation time). Render a 1200×630 card with: dark background, pet stage emoji large (96px), username, XP total, stage label, and the pet-trainer logo/tagline. Use only inline styles (ImageResponse does not support Tailwind or external CSS). The image is generated on-demand and cached by Vercel's Edge Cache.
- In `supabase/seed.sql`, add a seed row for `brunobracaioli` with a completed pet at stage 3, 1200 XP, and at least 5 completed quests — this allows `/u/brunobracaioli` to be the canonical demo URL for verifying the step.

## Files to create / modify

| Path                                            | Action | Notes                                                                                                                                      |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/app/u/[username]/page.tsx`            | create | RSC, ISR 60s; profile + pet + quests from Supabase; leaderboard rank from Redis; README badge copy block; `notFound()` on missing username |
| `apps/web/app/u/[username]/badge.svg/route.ts`  | create | Node GET; returns self-contained SVG; `Content-Type: image/svg+xml`; `Cache-Control: max-age=3600`; 404 on unknown username                |
| `apps/web/app/u/[username]/opengraph-image.tsx` | create | Next.js `ImageResponse` 1200×630; pet stage + username + XP + tagline; inline styles only                                                  |
| `supabase/seed.sql`                             | edit   | Add `brunobracaioli` profile + stage-3 pet + 5 completed quests for demo/verification                                                      |

## Verification

```bash
# Typecheck
pnpm --filter @specops/web typecheck

# Profile page: known user renders with 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/u/brunobracaioli | grep -q "200" \
  && echo "OK" || echo "FAIL"

# Profile page: unknown username returns 404
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/u/does-not-exist-xyz | grep -q "404" \
  && echo "OK" || echo "FAIL"

# Badge SVG: correct Content-Type
curl -sI http://localhost:3000/u/brunobracaioli/badge.svg | grep -i "content-type" | grep -q "image/svg+xml" \
  && echo "OK" || echo "FAIL"

# Badge SVG: valid SVG (starts with <svg)
curl -s http://localhost:3000/u/brunobracaioli/badge.svg | grep -q "^<svg" \
  && echo "OK" || echo "FAIL: not a valid SVG root element"

# Badge SVG: no external resource references
curl -s http://localhost:3000/u/brunobracaioli/badge.svg | grep -qE "href=[\"']https?://" \
  && echo "FAIL: external reference found (GitHub Camo will strip it)" || echo "OK: self-contained"

# Badge SVG: Cache-Control header present
curl -sI http://localhost:3000/u/brunobracaioli/badge.svg | grep -i "cache-control" | grep -q "max-age=3600" \
  && echo "OK" || echo "FAIL"

# Badge SVG: 404 on unknown username
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/u/does-not-exist-xyz/badge.svg | grep -q "404" \
  && echo "OK" || echo "FAIL"

# OG image: generates without error
curl -s -o /dev/null -w "%{http_code}" \
  -H "Accept: image/png" \
  http://localhost:3000/u/brunobracaioli/opengraph-image | grep -q "200" \
  && echo "OK" || echo "FAIL"

# revalidate config present on profile page
grep "revalidate" apps/web/app/u/\[username\]/page.tsx | grep -q "60" \
  && echo "OK" || echo "FAIL"
```

## Notes / Open questions

- The route segment `/u/[username]/badge.svg/route.ts` uses a directory named `badge.svg` because Next.js App Router requires API routes to live in directories named after the path segment. A directory named `badge.svg` containing `route.ts` correctly handles requests to `/u/[username]/badge.svg`.
- Badge SVG dimensions: 200×28px is a common badge width (matches shields.io standards). If the username is long (GitHub allows up to 39 chars), truncate the displayed username at 20 chars with an ellipsis in the SVG `<text>` element to prevent overflow.
- The `ImageResponse` function in `opengraph-image.tsx` has a cold-start cost on first request. Vercel caches generated OG images by URL, so subsequent requests for the same username are instant. Do not pre-generate OG images at build time — ISR handles caching.
- The leaderboard rank displayed on the profile page comes from `ZREVRANK lb:global:alltime {user_id}` (Upstash Redis). This is a real-time rank at request time, not a cached snapshot. If the Redis call fails (e.g. Upstash quota exceeded), fall back gracefully to "Rank: N/A" — never let a Redis failure break the profile page render.
- §1.2 identifies the badge as the primary viral growth vector. The badge copy block must be visually prominent on the profile page — place it in a highlighted box below the quest badges with a "Add to your README" heading and a copy-to-clipboard button.
- The `generateMetadata` export must be async (it fetches data) and must handle the not-found case: if `username` does not resolve to a profile, return minimal metadata without attempting to access pet data. Next.js will render the 404 from `notFound()` regardless of what `generateMetadata` returns.
- §13 Q2 (username derivation) is relevant here: in MVP, `username` equals `github_login` (populated by the Supabase GitHub OAuth flow in step `01-05`). Custom usernames are a post-MVP concern. The profile URL `/u/brunobracaioli` therefore also works as `/u/{github_login}`.
- Do not add `<link rel="canonical">` manually — Next.js `metadata.alternates.canonical` handles this. Set it to `https://pet.specops.black/u/${username}` in `generateMetadata`.
