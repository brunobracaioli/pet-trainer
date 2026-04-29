---
description: Create a new ADR file under docs/adr/ following the SPEC.md ADR style.
argument-hint: <short title>
---

The user wants to author a new ADR titled "$ARGUMENTS" for the `pet-trainer` repo.

Recall: SPEC.md is binding. Any architectural change drifts via an ADR amendment, not via code that contradicts the spec. The seed ADRs (0001-stack, 0002-no-microservices, 0003-http-hooks) live inline in SPEC.md §3.1–§3.3.

## Steps

1. **Pick number.** Check `docs/adr/` (create the directory if missing). The seed ADRs occupy 0001–0003. Pick `MAX(N) + 1` formatted as 4 digits — first new file is `0004`.

2. **Slug + path.** Slugify the title to kebab-case. Path: `docs/adr/NNNN-<slug>.md`.

3. **Write the file** using the SPEC.md §3.1 template:

```markdown
# ADR-NNNN — <Title>

**Status:** Proposed
**Date:** <today as YYYY-MM-DD>
**Decision makers:** Bruno

## Contexto

<what forced this decision — link to SPEC.md section, open question, or
incident if applicable>

## Opções avaliadas

| Opção | Trade-off |
|---|---|
| A — ... | ... |
| B — ... | ... |

## Decisão

<one paragraph, imperative voice>

## Justificativa

1. ...
2. ...

## Trade-offs aceitos

- ...

## Consequências

- **Positivas:** ...
- **Negativas:** ...
```

4. **Index.** If `docs/adr/README.md` already exists, append a row to its index. If it does not exist, do NOT create scaffolding the user did not ask for.

5. **Report back** with:
   - the path created,
   - reminder that ADRs are binding only after Status flips to `Accepted` (Bruno's call),
   - suggested commit message: `docs(adr): NNNN — <title> (proposed)`.

Do NOT mark the ADR `Accepted` yourself.
