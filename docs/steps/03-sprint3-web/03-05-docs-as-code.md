---
id: 03-05-docs-as-code
sprint: 3
order: 5
status: not-started
spec_refs: ['§11', '§9.1', '§8.1']
depends_on: [02-01-quest-catalog-mvp]
deliverables:
  - apps/web/app/docs/[[...slug]]/page.tsx
  - apps/web/app/docs/layout.tsx
  - packages/domain/src/openapi.ts
  - apps/web/app/api/v1/openapi.json/route.ts
  - docs/api/openapi.yaml
---

## Goal

Wire the repo's own `docs/` directory as a live `/docs` route rendered via Fumadocs in `apps/web`, and auto-generate the canonical OpenAPI 3.1 spec from Zod schemas via `zod-to-openapi` — fulfilling the §11 "generated automatically" requirement and ensuring the API contract is always in sync with implementation.

## Context

SPEC.md §11 defines the docs structure under `docs/` and mandates that: (1) MDX is rendered at `/docs` (Nextra or Fumadocs — §11 names both, but the CLAUDE.md preference is Fumadocs for Next.js 15 App Router compatibility), (2) OpenAPI 3.1 is generated from Zod schemas via `zod-to-openapi`, not hand-written, and (3) every PR touching quest code must update the corresponding `docs/quests/<id>.md`. The `docs/api/openapi.yaml` committed to the repo is the canonical API contract used by external integrators and the Vercel preview environment. This step depends on `02-01` because by Sprint 3 the quest catalog is complete and all 20 quest `.md` files exist in `docs/quests/` — the docs render must include them. The `packages/domain/src/openapi.ts` file imports from the domain package's Zod schemas (step `01-01`), so `01-01` is a transitive dependency via `02-01`.

## Implementation outline

- Install Fumadocs in `apps/web`: `pnpm --filter @specops/web add fumadocs-core fumadocs-ui fumadocs-mdx`. Add the Fumadocs MDX plugin to `apps/web/next.config.ts` (wrap the config with `withMDX` from `fumadocs-mdx/config`). Configure Fumadocs to read `.md` and `.mdx` files from the repo's top-level `docs/` directory — use Fumadocs' `loader()` function pointing at `../../docs` relative to `apps/web`. Fumadocs supports static generation of MDX from any directory via its `source.getPage()` and `source.generateParams()` APIs.
- Create `apps/web/app/docs/[[...slug]]/page.tsx` as an RSC: call `source.getPage(slug)` where `slug` comes from `params.slug` (the catch-all segment). If `getPage` returns null, call `notFound()`. Render `<DocsPage>` from `fumadocs-ui` with the page's MDX content via `page.data.body`. Export `generateStaticParams` that calls `source.generateParams()` to enumerate all docs pages at build time (fully static, no ISR needed).
- Create `apps/web/app/docs/layout.tsx` as a Fumadocs `<DocsLayout>` wrapper: configure sidebar navigation auto-generated from the `docs/` directory tree (Fumadocs `tree` object from the `source` loader). Add a dark mode toggle using Fumadocs' built-in theme support. Add a basic client-side search using Fumadocs' `<SearchDialog>` component (static search index from the MDX content — no Algolia or external search service required in MVP). The sidebar must show the file tree as nested collapsible sections matching the `docs/` directory structure (e.g. `steps/`, `quests/`, `adr/`, `runbooks/`, `api/`, `architecture/`).
- Create `packages/domain/src/openapi.ts`. Import `OpenAPIRegistry` and `OpenApiGeneratorV31` from `@asteasolutions/zod-to-openapi`. Import all Zod schemas from `packages/domain/src/schemas/index.ts`. Register each schema with the registry: `registry.register('Pet', PetSchema)`, `registry.register('EventPayload', EventPayloadSchema)`, etc. Define route documents for each endpoint from §8.2 using `registry.registerPath()`: include method, path (e.g. `POST /events`), request body schema (for POST routes), response schemas (200 + error codes), security definitions (Bearer JWT), and `operationId`. Export `generateOpenAPISpec(): OpenAPIObject` that instantiates `OpenApiGeneratorV31` and calls `.generateDocument({ openapi: '3.1.0', info: { title: 'pet-trainer API', version: 'v1', description: 'Base URL: https://pet.specops.black/api/v1' } })`.
- Add `@asteasolutions/zod-to-openapi` to `packages/domain/package.json` dependencies (it is a peer of `zod`). This is the only additional dependency allowed in `packages/domain` beyond `zod`.
- Create `apps/web/app/api/v1/openapi.json/route.ts` as a static route handler (no runtime declaration — defaults to Node). Export `GET()` that imports `generateOpenAPISpec` from `@specops/domain` and returns `Response.json(generateOpenAPISpec())`. Add `export const dynamic = 'force-static'` so Next.js pre-generates the JSON at build time and serves it from the CDN — the spec does not change at runtime.
- Add a `generate:openapi` script to the root `package.json` (and to `packages/domain/package.json`): `node --loader ts-node/esm packages/domain/src/scripts/generate-openapi.ts > docs/api/openapi.yaml`. Create `packages/domain/src/scripts/generate-openapi.ts`: imports `generateOpenAPISpec`, converts the result to YAML using `js-yaml` (`yaml.dump(generateOpenAPISpec())`), writes to stdout. Add `js-yaml` to `packages/domain` dev dependencies. The script is run manually before each release and its output is committed; CI validates that the committed `docs/api/openapi.yaml` is not stale (run `pnpm generate:openapi && git diff --exit-code docs/api/openapi.yaml` in CI).
- After generating for the first time, commit `docs/api/openapi.yaml` to the repo as the initial canonical contract. Add a `# This file is auto-generated. Run \`pnpm generate:openapi\` to regenerate.` header comment.

## Files to create / modify

| Path                                              | Action | Notes                                                                                                |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `apps/web/app/docs/[[...slug]]/page.tsx`          | create | RSC; Fumadocs `source.getPage()`; `generateStaticParams`; `notFound()` on missing slug               |
| `apps/web/app/docs/layout.tsx`                    | create | Fumadocs `<DocsLayout>` with sidebar tree, dark mode toggle, client-side search                      |
| `apps/web/next.config.ts`                         | edit   | Wrap with Fumadocs MDX plugin (`withMDX`); add `docs/` directory as MDX source                       |
| `packages/domain/src/openapi.ts`                  | create | `generateOpenAPISpec()` using `zod-to-openapi`; registers all schemas + routes from §8.2             |
| `packages/domain/src/scripts/generate-openapi.ts` | create | Node script: calls `generateOpenAPISpec()`, converts to YAML via `js-yaml`, writes to stdout         |
| `packages/domain/package.json`                    | edit   | Add `@asteasolutions/zod-to-openapi`; add `js-yaml` as devDependency; add `generate:openapi` script  |
| `apps/web/app/api/v1/openapi.json/route.ts`       | create | Node GET; `force-static`; imports and serves `generateOpenAPISpec()` as JSON                         |
| `docs/api/openapi.yaml`                           | create | Auto-generated first run output; committed to repo as canonical contract                             |
| `package.json` (root)                             | edit   | Add `"generate:openapi"` script that delegates to `packages/domain` generate script                  |
| `.github/workflows/ci.yml`                        | edit   | Add step: `pnpm generate:openapi && git diff --exit-code docs/api/openapi.yaml` to detect stale spec |

## Verification

```bash
# Fumadocs packages installed
cat apps/web/package.json | grep -E '"fumadocs-core"|"fumadocs-ui"|"fumadocs-mdx"' | wc -l | grep -q "3" \
  && echo "OK" || echo "FAIL: fumadocs packages missing"

# Docs root page renders (docs/README.md content)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/docs | grep -q "200" \
  && echo "OK" || echo "FAIL"

# Step spec page renders (tests catch-all slug routing)
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/docs/steps/00-sprint0-bootstrap/00-01-monorepo-scaffold" | grep -q "200" \
  && echo "OK" || echo "FAIL"

# Quest page renders (confirms quest catalog MDX exists after step 02-01)
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/docs/quests/first-edit" | grep -q "200" \
  && echo "OK" || echo "FAIL"

# Unknown slug returns 404
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/docs/this-does-not-exist" | grep -q "404" \
  && echo "OK" || echo "FAIL"

# OpenAPI JSON endpoint returns valid JSON with openapi 3.1 field
curl -s http://localhost:3000/api/v1/openapi.json | jq '.openapi' | grep -q "3.1" \
  && echo "OK" || echo "FAIL"

# OpenAPI JSON contains all expected schemas
curl -s http://localhost:3000/api/v1/openapi.json | jq '.components.schemas | keys' | \
  grep -qE "Pet|EventPayload|Quest|Profile" && echo "OK" || echo "FAIL: schema missing"

# OpenAPI JSON is statically generated (force-static)
grep "force-static" apps/web/app/api/v1/openapi.json/route.ts \
  && echo "OK" || echo "FAIL: missing force-static"

# generate:openapi script produces valid YAML
pnpm generate:openapi | head -1 | grep -q "openapi" && echo "OK" || echo "FAIL"

# Committed openapi.yaml is not stale
pnpm generate:openapi > /tmp/openapi-fresh.yaml && \
  diff /tmp/openapi-fresh.yaml docs/api/openapi.yaml && \
  echo "OK: spec is current" || echo "FAIL: committed spec is stale, run pnpm generate:openapi"

# Typecheck across workspace (domain + web)
pnpm typecheck
```

## Notes / Open questions

- Fumadocs is preferred over Nextra per the CLAUDE.md project instructions ("Fumadocs is preferred over Nextra for Next.js 15 App Router compatibility"). Nextra 2.x has known issues with App Router; Fumadocs was built for it.
- The `docs/` source directory is at the monorepo root (not inside `apps/web`). Fumadocs' `loader()` accepts a `rootDir` option — set it to the absolute path of the repo root's `docs/` folder. In Next.js, `process.cwd()` inside `next.config.ts` resolves to `apps/web`, so use `path.resolve(process.cwd(), '../../docs')` for the source path.
- The `openapi.json` route directory name is `openapi.json` (including the extension) because Next.js App Router uses the directory name as the path segment. A directory named `openapi.json` containing `route.ts` correctly serves requests to `/api/v1/openapi.json`.
- `@asteasolutions/zod-to-openapi` is the production package for `zod-to-openapi`. It supports Zod v3 and OpenAPI 3.1. Check the package version compatibility with the `zod` version already installed in `packages/domain` before adding. As of 2026-04, `@asteasolutions/zod-to-openapi` v7+ supports `zod@^3.22`.
- The `generate-openapi.ts` script uses `--loader ts-node/esm` for direct TypeScript execution. An alternative is adding a `tsx` devDependency (`pnpm add -Dw tsx`) and using `tsx packages/domain/src/scripts/generate-openapi.ts` — this is simpler and avoids `ts-node` ESM configuration friction.
- The CI check (`git diff --exit-code docs/api/openapi.yaml`) will fail if a developer modifies a Zod schema without regenerating the YAML. This is the desired behavior — it enforces §11's "generated automatically" requirement and prevents schema drift. Document this check in the PR template so contributors know to run `pnpm generate:openapi` before pushing.
- The docs sidebar auto-generation from the `docs/` file tree will include `SPEC.md`, `implementation-plan.md`, `README.md`, step specs, quest docs, ADRs, runbooks, and architecture docs — everything in `docs/`. This is intentional (the entire docs corpus is browsable at `/docs`). If certain directories should be excluded from the sidebar (e.g. `docs/steps/` is implementation-internal), configure Fumadocs' `sidebar.exclude` option.
- §11 states that CODEOWNERS enforcement for the "every quest PR must update docs/quests/<id>.md" rule is part of the repo setup. The `.claude/hooks/docs-reminder.js` hook already exists (per the git log in the conversation context). The CI check for stale `openapi.yaml` is the analogous enforcement for API schema changes.
