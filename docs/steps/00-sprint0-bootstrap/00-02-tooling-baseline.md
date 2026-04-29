---
id: 00-02-tooling-baseline
sprint: 0
order: 2
status: done
spec_refs: ['§3.1', '§10.3']
depends_on: ['00-01-monorepo-scaffold']
deliverables:
  - tsconfig.base.json
  - apps/web/tsconfig.json
  - apps/cli/tsconfig.json
  - packages/domain/tsconfig.json
  - packages/quest-engine/tsconfig.json
  - packages/ui/tsconfig.json
  - .eslintrc.cjs
  - .prettierrc
  - .prettierignore
  - vitest.workspace.ts
  - packages/domain/vitest.config.ts
  - packages/quest-engine/vitest.config.ts
  - .husky/pre-commit
  - .secretlintrc.json
  - .gitleaks.toml
acceptance:
  - pnpm lint passes on empty workspace (exit 0)
  - pnpm typecheck passes across all packages (exit 0)
  - pnpm test runs 0 tests and exits 0
  - .husky/pre-commit is executable (ls -l shows -rwxr-xr-x)
  - git commit --dry-run triggers the pre-commit hook without errors on a clean repo
---

## Goal

Install and configure the full TypeScript + ESLint + Prettier + Vitest + pre-commit security guard stack so that every subsequent step inherits consistent type-safety and code quality enforcement from the first line of real code.

## Context

SPEC.md §3.1 specifies TypeScript end-to-end with strict typing. §10.3 (step 1 of the CI/CD pipeline) requires secretlint + gitleaks + eslint + prettier running as a pre-commit hook via husky before any code ever reaches GitHub. This step must complete before 00-04 (CI scaffold) because the GitHub Actions pipeline mirrors what husky enforces locally. Steps 01-01 through 01-07 all write TypeScript; without strict tsconfig they would accumulate silent type errors.

## Implementation outline

- Create `tsconfig.base.json` at repo root with `"strict": true`, `"moduleResolution": "bundler"`, `"target": "ES2022"`, `"lib": ["ES2022"]`, `"module": "ESNext"`, `"esModuleInterop": true`, `"skipLibCheck": true`, `"forceConsistentCasingInFileNames": true`, `"declaration": true`, `"declarationMap": true`, and `"sourceMap": true` — the `bundler` resolution mode is required for Next.js 15 App Router (§3.1) and works fine for the CLI package with tsc.
- Create a `tsconfig.json` in each app and package that extends `"../../tsconfig.base.json"` (or `"../tsconfig.base.json"` for top-level packages), setting `"include": ["src"]` and a project-specific `"outDir"`. For `apps/web`, also add `"plugins": [{ "name": "next" }]` and `"jsx": "preserve"`.
- Install root devDependencies: `turbo`, `typescript`, `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-import`, `eslint-config-prettier`, `prettier`, `vitest`, `@vitest/coverage-v8`, `husky`, `secretlint`, `@secretlint/secretlint-rule-preset-recommend`, `lint-staged` — all as devDependencies in the root `package.json` (pnpm hoists them to all packages automatically).
- Create `.eslintrc.cjs` at repo root extending `["plugin:@typescript-eslint/recommended", "eslint-config-prettier"]` with `"rules": { "no-console": "warn", "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }] }` — `eslint-config-prettier` must be last to disable all formatting rules that conflict with Prettier (§3.1 strict typing mandate).
- Create `.prettierrc` with `{ "singleQuote": true, "semi": false, "printWidth": 100, "trailingComma": "es5", "tabWidth": 2 }` and `.prettierignore` listing `dist/`, `.next/`, `node_modules/`, `*.generated.ts`, `supabase/.branches/` — prevents Prettier from touching build artifacts and Supabase-generated files.
- Create `vitest.workspace.ts` at repo root pointing to `packages/domain/vitest.config.ts` and `packages/quest-engine/vitest.config.ts` (the only two packages with business logic testable in Sprint 0). Each package-level `vitest.config.ts` sets `environment: "node"` and `include: ["src/**/*.test.ts"]`.
- Initialize husky with `pnpm dlx husky init` and write `.husky/pre-commit` to run `pnpm lint-staged` — configure `lint-staged` in root `package.json` to run `eslint --fix` on `**/*.{ts,tsx}` and `prettier --write` on `**/*.{ts,tsx,json,md}` only on staged files, and always run `secretlint` on all staged files.
- Create `.secretlintrc.json` with `{ "rules": [{ "id": "@secretlint/secretlint-rule-preset-recommend" }] }` and add a custom pattern entry matching `PET_TRAINER_TOKEN=[A-Za-z0-9._-]{20,}` to catch accidental credential commits before they hit GitHub (§10.3, §10.4).
- Create `.gitleaks.toml` with a baseline config enabling the default `[extend]` from the upstream gitleaks ruleset and a project-specific rule targeting the `PET_TRAINER_TOKEN` pattern — this runs in the pre-commit hook and also in CI (step 00-04, job 1).

## Files to create / modify

| Path                                     | Action | Notes                                                     |
| ---------------------------------------- | ------ | --------------------------------------------------------- |
| `tsconfig.base.json`                     | create | Root TS config: strict, moduleResolution bundler, ES2022  |
| `apps/web/tsconfig.json`                 | create | Extends base, adds Next.js plugin, jsx: preserve          |
| `apps/cli/tsconfig.json`                 | create | Extends base, outDir: dist, module: CommonJS for Node CLI |
| `packages/domain/tsconfig.json`          | create | Extends base, include: src                                |
| `packages/quest-engine/tsconfig.json`    | create | Extends base, include: src                                |
| `packages/ui/tsconfig.json`              | create | Extends base, jsx: react-jsx                              |
| `.eslintrc.cjs`                          | create | typescript-eslint/recommended + eslint-config-prettier    |
| `.prettierrc`                            | create | singleQuote, no semi, printWidth 100                      |
| `.prettierignore`                        | create | dist/, .next/, node_modules/, \*.generated.ts             |
| `vitest.workspace.ts`                    | create | Points to domain and quest-engine vitest configs          |
| `packages/domain/vitest.config.ts`       | create | node environment, src/\*_/_.test.ts                       |
| `packages/quest-engine/vitest.config.ts` | create | node environment, src/\*_/_.test.ts                       |
| `.husky/pre-commit`                      | create | Runs pnpm lint-staged; must be chmod +x                   |
| `.secretlintrc.json`                     | create | preset-recommend + PET_TRAINER_TOKEN custom rule          |
| `.gitleaks.toml`                         | create | Default ruleset + project-specific token pattern          |
| `package.json`                           | edit   | Add devDependencies, lint-staged config block             |

## Verification

```bash
# TypeScript: all packages check clean
pnpm typecheck

# ESLint: no errors on stub files
pnpm lint

# Prettier: dry run shows no formatting changes needed
pnpm prettier --check "**/*.{ts,tsx,json}"

# Vitest: discovers zero tests, exits 0
pnpm test

# Husky hook is executable
ls -l .husky/pre-commit
# Expected: -rwxr-xr-x (or equivalent with execute bit set)

# Secretlint: no violations on clean repo
pnpm dlx secretlint "**/*"

# Simulate a bad commit to confirm the hook fires
echo 'const t = "PET_TRAINER_TOKEN=abc123secretvalue"' > /tmp/test-secret.ts
git add /tmp/test-secret.ts 2>/dev/null || true
# Hook should reject; clean up after
git reset HEAD /tmp/test-secret.ts 2>/dev/null || true
rm /tmp/test-secret.ts
```

## Notes / Open questions

- `apps/cli/tsconfig.json` must set `"module": "CommonJS"` (not ESNext) because the CLI is a Node.js binary distributed via npm and must run with `node dist/cli.js` without `--experimental-vm-modules`. All other packages can use ESNext module format.
- Do not use `eslint-plugin-prettier` — it runs Prettier as an ESLint rule and doubles formatting time. Instead, use `eslint-config-prettier` (disables conflicting rules) and run Prettier separately via lint-staged. This is the current recommended pattern.
- `packages/quest-engine` must have zero runtime npm dependencies (§7.1 — pure evaluator for Edge Runtime). Its `vitest.config.ts` must not import any testing utilities beyond Vitest itself.
- The secretlint `PET_TRAINER_TOKEN` pattern must match a value of at least 20 characters to avoid false positives on variable name references. The pattern `PET_TRAINER_TOKEN=[A-Za-z0-9._-]{20,}` covers this.
- SPEC §10.4 states secrets are rotated quarterly. The `.gitleaks.toml` baseline should be committed to the repo so all contributors (future) get the same protection. Do not add `.gitleaks.toml` to `.gitignore`.
- `vitest.workspace.ts` should only reference packages that have test files or will have them in Sprint 1 (`domain`, `quest-engine`). Adding `apps/web` and `apps/cli` to the workspace config comes in steps 01-04 and 01-06 respectively.
