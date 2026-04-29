---
description: Print pet-trainer status — sprint progress, ADRs, open questions, catalog drift.
---

You are reporting status for the `pet-trainer` repository (see CLAUDE.md and SPEC.md). Produce a concise markdown report — no fluff, no preamble.

If the repo is in spec-only state (no `apps/`, no `packages/`, no `supabase/migrations/`), say so in one line at the top so the rest of the report makes sense.

## Sections to emit (in order)

### 1. Sprint progress
Read SPEC.md §12 (Roadmap MVP). For each `### Sprint N` heading, count `- [x]` vs `- [ ]` checklist items. Report as:

```
Sprint 0 — done/total
Sprint 1 — done/total
...
```

Identify the active sprint as the first one that's not 100% done.

### 2. ADRs
List `docs/adr/*.md` (or note "not scaffolded yet — seed ADRs live inline in SPEC.md §3.1–§3.3" if the directory doesn't exist). For each file, print `NNNN — <title> — <Status field>`.

### 3. Open Questions
Read SPEC.md §13. List rows. For each, look for an answer: a matching ADR, a SPEC amendment, or a recent commit message touching the question's owner area. Mark resolved ones with ✓; leave unresolved ones plain.

### 4. Quest catalog drift
If `docs/quests/` and `supabase/seed.sql` both exist, diff the set of ids (filenames vs `INSERT INTO public.quests` rows). Report ids present in only one side. If neither exists, say "catalog not bootstrapped yet (Sprint 1)".

### 5. Repo state
Run `git status -sb` (if this is a git repo) and summarize: branch, ahead/behind, staged/unstaged file counts. If not a git repo, say so.

## Style
Short markdown. Bullets, not paragraphs. If a section has nothing to report, write `_nothing yet_` rather than omitting the heading.
