---
id: 00-01-monorepo-scaffold
sprint: 0
order: 1
status: done
spec_refs: ['§3.1', '§14.A']
depends_on: []
deliverables:
  - pnpm-workspace.yaml
  - turbo.json
  - package.json
  - apps/web/package.json
  - apps/cli/package.json
  - apps/web/src/index.ts
  - apps/cli/src/index.ts
  - packages/domain/package.json
  - packages/domain/src/index.ts
  - packages/quest-engine/package.json
  - packages/quest-engine/src/index.ts
  - packages/ui/package.json
  - packages/ui/src/index.ts
acceptance:
  - pnpm install runs clean from repo root (exit 0, no unmet peer warnings)
  - pnpm turbo typecheck exits 0 across all workspace packages
  - Each package directory exists with package.json and src/index.ts
---

## Goal

Bootstrap the Turborepo monorepo with all five workspace packages as typed stubs so that every subsequent step has a valid dependency graph to build on.

## Context

SPEC.md §14.A defines the canonical monorepo structure: `apps/web` (Next.js 15), `apps/cli` (`@specops/pet-trainer` npm package), and three internal packages (`domain`, `quest-engine`, `ui`). This is Sprint 0 step 1 — nothing else in the sprint can begin until the workspace resolves cleanly. Steps 00-02 (tooling), 00-03 (Supabase init), and 00-05 (ADRs) all depend on this scaffold existing on disk; step 00-04 (Vercel + CI) depends on 00-02 completing, which depends on this step.

## Implementation outline

- Create `pnpm-workspace.yaml` at repo root declaring `packages: ["apps/*", "packages/*"]` — exactly the shape shown in §14.A (§3.1 mandates pnpm as package manager, Node ≥ 20).
- Create root `package.json` with `"private": true`, `"engines": { "pnpm": ">=9", "node": ">=20" }`, and `"scripts"` delegating `typecheck`, `lint`, `test`, `build`, and `dev` to `turbo run <task>` — no direct commands at root level.
- Create `turbo.json` with a `"tasks"` block for `typecheck` (`dependsOn: ["^typecheck"]`), `lint` (`dependsOn: ["^lint"]`), `test` (`dependsOn: ["^typecheck"]`, `outputs: []`), `build` (`dependsOn: ["^build"]`, `outputs: ["dist/**", ".next/**"]`), and `dev` (`persistent: true`, `cache: false`) — consistent with §10.3 pipeline order.
- Create `apps/web/package.json` with `"name": "@specops/web"`, `"private": true`, and `"scripts": { "typecheck": "tsc --noEmit", "lint": "eslint .", "build": "next build", "dev": "next dev" }` — Next.js 15 will be added in Sprint 1, so keep devDependencies empty for now except a `typescript` placeholder.
- Create `apps/cli/package.json` with `"name": "@specops/pet-trainer"`, `"version": "0.1.0"`, `"bin": { "pet": "./dist/cli.js" }`, `"main": "./dist/index.js"`, `"files": ["dist"]`, and `"scripts": { "typecheck": "tsc --noEmit", "build": "tsc" }` — this is the only package published to npm (§3.1); internal packages are never published directly.
- Create `packages/domain/package.json` with `"name": "@specops/domain"`, `"version": "0.0.0"`, `"exports": { ".": "./src/index.ts" }` and `"scripts": { "typecheck": "tsc --noEmit" }` — Zod schemas land here in step 01-01; for now, stub only.
- Create `packages/quest-engine/package.json` with `"name": "@specops/quest-engine"`, `"version": "0.0.0"`, `"exports": { ".": "./src/index.ts" }` — must remain pure and dependency-free per §7.1 (evaluator runs on Edge Runtime).
- Create `packages/ui/package.json` with `"name": "@specops/ui"`, `"private": true`, `"version": "0.0.0"` — shadcn components; private because it is consumed internally only.
- Add a minimal `src/index.ts` in each package/app exporting an empty object (`export {}`) so TypeScript finds an entry point and `tsc --noEmit` passes without errors.

## Files to create / modify

| Path                                 | Action | Notes                                                   |
| ------------------------------------ | ------ | ------------------------------------------------------- |
| `pnpm-workspace.yaml`                | create | Declares `apps/*` and `packages/*` as workspace members |
| `turbo.json`                         | create | Pipeline tasks: typecheck, lint, test, build, dev       |
| `package.json`                       | create | Root manifest: private, engines, turbo scripts          |
| `apps/web/package.json`              | create | `@specops/web`, private, Next.js 15 placeholder         |
| `apps/web/src/index.ts`              | create | `export {}` stub                                        |
| `apps/cli/package.json`              | create | `@specops/pet-trainer` v0.1.0, bin: pet → dist/cli.js   |
| `apps/cli/src/index.ts`              | create | `export {}` stub (real CLI entry added in step 01-06)   |
| `packages/domain/package.json`       | create | `@specops/domain`, exports src/index.ts                 |
| `packages/domain/src/index.ts`       | create | `export {}` stub                                        |
| `packages/quest-engine/package.json` | create | `@specops/quest-engine`, zero runtime deps              |
| `packages/quest-engine/src/index.ts` | create | `export {}` stub                                        |
| `packages/ui/package.json`           | create | `@specops/ui`, private                                  |
| `packages/ui/src/index.ts`           | create | `export {}` stub                                        |
| `.gitignore`                         | edit   | Add `node_modules/`, `dist/`, `.next/`, `.turbo/`       |

## Verification

```bash
# From repo root:
pnpm install

# Should print "packages found in workspace: 5" or similar and exit 0
pnpm turbo typecheck

# Confirm all package.json files exist
ls apps/web/package.json apps/cli/package.json \
   packages/domain/package.json \
   packages/quest-engine/package.json \
   packages/ui/package.json

# Confirm bin field is present on the CLI package
node -e "const p = require('./apps/cli/package.json'); console.log(p.bin)"
# Expected: { pet: './dist/cli.js' }
```

## Notes / Open questions

- `packages/` are internal workspace libraries and must never be published to npm directly. Only `apps/cli` carries the public `@specops/pet-trainer` identity (§3.1).
- `packages/quest-engine` must stay dependency-free now and forever (§7.1) — no `import` from npm in its `package.json` `"dependencies"` block. Peer deps from domain types are workspace refs only.
- The `"exports"` field on internal packages uses `"./src/index.ts"` (TypeScript source) rather than a compiled output because Turborepo + pnpm workspace resolution handles transpilation; a separate `tsconfig.json` with `paths` is not needed in a Turborepo setup.
- SPEC §13 OQ-6: "Validate with Anthropic whether 'pet-trainer' as a name creates a trademark conflict." This does not block scaffolding, but the npm package name `@specops/pet-trainer` is the safe scoped version in the meantime.
- The root `package.json` must not list any runtime dependencies — all runtime deps live inside individual apps/packages. Root devDeps are limited to `turbo` and `typescript` (shared tooling installed in step 00-02).
