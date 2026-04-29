---
id: <sprint>-<order>-<slug>
sprint: <0|1|2|3|4>
order: <number within sprint>
status: not-started
spec_refs: ['§X.Y'] # at least one SPEC.md section
depends_on: [] # list of step ids that must be `done` first
deliverables:
  - path/to/file # exact paths that will exist when step is done
acceptance:
  - Shell command or condition that proves this step is complete
---

## Goal

One sentence: what this step produces and why it matters for the MVP.

## Context

2–4 sentences explaining:

- Which SPEC.md section drives this step (cite §number)
- Where this fits in the sprint sequence
- What is blocked or broken until this step is done

## Implementation outline

- Concrete, actionable bullet (reference §section)
- 5–8 bullets total, each specific enough to code from
- No vague directives like "implement X" — say _exactly_ what to create, configure, or run
- Include commands, package names, file paths, env var names where relevant

## Files to create / modify

| Path            | Action | Notes                          |
| --------------- | ------ | ------------------------------ |
| `path/to/file`  | create | Brief note on what it contains |
| `path/to/other` | edit   | What changes                   |

## Verification

```bash
# Commands that prove every acceptance criterion passes
pnpm typecheck
supabase status
```

## Notes / Open questions

- Any non-obvious constraint worth calling out
- SPEC.md §13 open questions that affect this step (link to OQ by number)
- Known blockers or prerequisites not captured in depends_on
