# pet-trainer — Spec-Driven Development

> **Status:** Draft v1.0 — MVP Scope
> **Owner:** Bruno Bracaioli (B2Tech / SpecOps.black)
> **Last updated:** 2026-04-29
> **Tagline:** *Your pet evolves only if you actually use Claude Code.*

---

## 0. Sumário Executivo

`pet-trainer` é um **Tamagotchi de terminal open-source** que ensina Claude Code via gamificação. O aluno instala o pacote (`npx @specops/pet-trainer init` ou `pip install pet-trainer`), e a partir desse momento toda tool call do Claude Code (Edit, Write, Bash, Task, etc.) é capturada por um **HTTP hook** que reporta o evento pra uma API na Vercel. Quests são completadas, XP é creditado, o pet evolui — e o aluno absorve permissions, hooks, slash commands, subagents e MCP **sem perceber que tá decorando**.

A web em `pet.specops.black` mostra dashboard pessoal, leaderboard global e perfil compartilhável (vetor de crescimento orgânico).

**Modelo:** Open-source gratuito · MIT license · distribuição via npm + PyPI · monetização indireta (lead-gen pra B2Tech / SpecOps.black + Claude Partner Network credibility).

**MVP timeline alvo:** 4 sprints (8 semanas).

---

## 1. Problem Statement & Hypothesis

### 1.1 Problem
Claude Code tem curva de aprendizado real: hooks, slash commands, subagents, permissions, MCP, skills. A documentação é boa, mas **leitura passiva ≠ retenção motora**. Bootcamps e cursos pagos resolvem para alguns, mas a maioria dos devs aprende fazendo — e errando.

### 1.2 Hypothesis
> Se transformarmos cada feature do Claude Code em uma quest gamificada com feedback imediato (XP, evolução visual de um pet), a retenção e o tempo-até-proficiência caem ≥40% comparado a tutorial em texto.

### 1.3 Success Metrics (MVP)
| Métrica | Target 90d pós-launch |
|---|---|
| Instalações (npm + PyPI combined) | 5.000 |
| DAU / MAU ratio | ≥ 0.20 |
| Quests completadas/usuário (mediana) | ≥ 8 |
| Pets que atingem evolução 2+ | ≥ 30% dos usuários ativos |
| GitHub stars | 1.500 |
| Conversões pra B2Tech newsletter (opt-in) | 800 |

### 1.4 Non-Goals (MVP)
- Multiplayer real-time / battles entre pets
- Marketplace de quests da comunidade (fase 2)
- Mobile app (a web é responsive, mas não nativa)
- Skins pagas / freemium tier
- Internacionalização além de pt-BR e en-US

---

## 2. Personas

**P1 — "Dev curioso" (primário, 70%)**
Dev backend/fullstack BR ou US, 25-40 anos, já usa Claude Code mas só Edit/Bash. Quer dominar hooks/subagents mas não tem tempo pra ler docs. Encontra `pet-trainer` via Twitter/Instagram/Reddit.

**P2 — "Estudante de bootcamp" (secundário, 20%)**
Aluno de bootcamp ou faculdade, primeira exposição a IA-coding. Usa o pet pra ter feedback didático estruturado.

**P3 — "Tech lead avaliando adoção" (terciário, 10%)**
Lead que quer ver a equipe usando Claude Code de forma consistente. Avalia se vale recomendar internamente. Olha leaderboard interno (fase 2).

---

## 3. Decisões de Arquitetura

### 3.1 ADR-001 — Stack de Produção

**Status:** Accepted
**Date:** 2026-04-29
**Decision makers:** Bruno (architect)

#### Contexto
Precisamos escolher backend, frontend, banco, cache, hosting e CI/CD para um produto cloud-first com:
- CLI distribuído via npm/PyPI (instalação em segundos)
- Endpoint HTTP de baixa latência pra hooks (P95 < 200ms)
- Estado persistente multi-usuário (pets, XP, quests, leaderboard)
- Web dashboard responsivo
- Custo operacional ≤ US$ 50/mês até 10k usuários ativos
- Bruno tem ~10 anos de experiência em GCP, mas o stack do projeto privilegia Vercel pela latência de edge e DX
- Time of one (Bruno + Claude Code) — ferramentas devem maximizar velocidade de iteração

#### Opções avaliadas

| Camada | Opção A | Opção B | Opção C (escolhida) |
|---|---|---|---|
| Backend API | Python/FastAPI no Cloud Run | Node/Express no Vercel Functions | **TypeScript/Next.js Route Handlers (Vercel)** |
| DB | Cloud SQL Postgres (GCP) | Neon | **Supabase (Postgres gerenciado + Auth + RLS)** |
| Cache | Redis no Cloud Memorystore | Vercel KV | **Upstash Redis (serverless, pay-per-request)** |
| Frontend | React + Vite (SPA) | Astro | **Next.js 15 App Router (mesmo monorepo)** |
| CDN/Edge | Cloudflare | Fastly | **Vercel Edge Network (incluído)** |
| CLI runtime | Python | Go | **Node.js/TypeScript (mesmo idioma do backend)** |

#### Decisão

Stack único TypeScript end-to-end:
- **Frontend + Backend:** Next.js 15 (App Router) na Vercel, com Route Handlers em `app/api/*` rodando como Edge Functions onde latência importa (hook ingestion) e Node Functions onde precisa de SDK não-edge-compatible.
- **DB:** Supabase Postgres com Row-Level Security (RLS) ligado por padrão. Auth via Supabase Auth (GitHub OAuth como provedor primário — coerente com público dev).
- **Cache:** Upstash Redis para rate-limiting, contadores de XP em vôo, leaderboard sorted sets.
- **CLI:** Pacote npm `@specops/pet-trainer` (Node 20+) e wrapper Python `pet-trainer` no PyPI que invoca o Node CLI via shellout (mantém core num lugar só, mas garante distribuição em ambos ecossistemas).
- **Observability:** Vercel Analytics + Logflare drain pro Supabase (cold storage de eventos).
- **CI/CD:** GitHub Actions → Vercel Preview Deploys + Supabase migrations via `supabase db push`.

#### Justificativa

1. **TypeScript end-to-end reduz context-switching cognitive load** — modelos de domínio compartilhados entre CLI, API e dashboard via pacote interno `@specops/pet-trainer-domain` no monorepo (Turborepo).
2. **Vercel Edge Functions** entregam P50 < 50ms globalmente pra hook ingestion — crítico, porque a latência do hook **bloqueia o usuário no terminal**. Cada milissegundo de delay no PostToolUse é fricção visível.
3. **Supabase RLS** dá multi-tenancy seguro by default sem código de autorização espalhado — Security by Design real, não slogan.
4. **Upstash** é serverless (zero idle cost) e tem SDK HTTP-native que funciona em Edge Runtime. Vercel KV é viável, mas Upstash tem operações de sorted-set mais maduras (essencial pro leaderboard).
5. **Custo MVP:** Supabase free tier (500MB) + Vercel hobby (100GB bandwidth) + Upstash free (10k commands/dia) cobre os primeiros milhares de usuários a custo zero. Em produção a estimativa é US$ 25-40/mês até 10k MAU.

#### Trade-offs aceitos

- **Lock-in Vercel:** o hook ingest endpoint depende de Edge Runtime. Se for necessário sair da Vercel, refactor de ~500 LOC. Aceitável dado o ROI de DX.
- **Supabase Auth ≠ enterprise SSO:** OK pra público dev. Se virar B2B (fase 3), migra pra Clerk ou WorkOS.
- **GCP ausente:** apesar da minha expertise primária, este projeto não justifica os 2-3 dias extras de setup que GCP exigiria. ADR documenta para que futuros projetos B2B mantenham GCP como default.

#### Consequências
- **Positivas:** ship em 8 semanas, custo near-zero no MVP, stack contemporâneo demonstra competência da B2Tech.
- **Negativas:** dependência de 3 vendors (Vercel, Supabase, Upstash). Risco de pricing change mitigado por arquitetura que pode portar pra GCP em ~1 sprint se necessário.

---

### 3.2 ADR-002 — Não usar microservices no MVP

**Status:** Accepted

#### Contexto
A diretriz original menciona "micro-services (se couber no MVP)". Avaliei e decidi **não** fragmentar.

#### Decisão
**Modular monolith** dentro do Next.js, organizado por **Vertical Slices** (`features/quest`, `features/pet`, `features/xp`, `features/auth`, `features/telemetry`). Cada slice tem seu próprio domínio, schema Postgres (ou tabelas claramente prefixadas), use cases, e route handlers.

#### Justificativa
- Time de 1 pessoa + Claude Code: microservices multiplicam ops overhead sem retorno até ~50k MAU.
- Vertical Slice Architecture já dá os benefícios de bounded context **sem** os custos de service mesh, distributed tracing complexo, e versionamento de contratos.
- Quando (e se) escalar exigir, o slice é candidato natural a virar serviço — é literalmente um diretório que vira repo.

#### Critério de extração futura
Slice vira microserviço quando atender ≥2 dos critérios:
1. Volume de eventos > 10x a média dos outros slices
2. Necessidade de stack diferente (ex: ML em Python pra detecção de anti-cheat)
3. Time dedicado (≥2 devs) trabalhando exclusivamente nele
4. SLO conflitante (ex: hook ingest precisa 99.99%, dashboard pode 99.5%)

---

### 3.3 ADR-003 — HTTP Hooks ao invés de Command Hooks

**Status:** Accepted

#### Contexto
Claude Code suporta hooks via `command` (shell local) ou `http` (POST pra endpoint). Telemetria de quests pode usar qualquer um.

#### Decisão
**HTTP hooks** como mecanismo primário, com fallback opcional pra command hook (offline buffer).

#### Justificativa
- Hook HTTP envia direto pro `/api/v1/events` na Vercel — **zero processo local rodando**, zero risco de stale state em arquivo JSON.
- Permite atualizar lógica de detecção de quests **server-side** sem o aluno precisar atualizar a CLI.
- `${CLAUDE_SESSION_ID}` + JWT no header autentica a chamada sem precisar de OAuth handshake por evento.
- Command hooks ficam disponíveis como fallback offline (quest progress vai pra `~/.pet-trainer/buffer.jsonl`, sincroniza no próximo `pet sync`).

#### Trade-offs
- Latência de rede vira fator. Mitigação: hook é **fire-and-forget** (timeout 2s, falha silenciosa não bloqueia o tool call). Edge Function responde em <100ms P95.
- Privacidade: tool inputs/outputs trafegam via HTTPS pra nossa API. Mitigação documentada na seção §10 (Security & Privacy).

---

## 4. Arquitetura de Alto Nível

### 4.1 Diagrama lógico (textual)

```
┌─────────────────────────────────────────────────────────────────┐
│  ALUNO (terminal local)                                         │
│                                                                 │
│  ┌──────────────┐   ┌──────────────────────────────────────┐    │
│  │ Claude Code  │──▶│ HTTP Hook (PostToolUse, Stop, etc.)  │    │
│  └──────────────┘   └──────────────────────────────────────┘    │
│         │                              │                        │
│         │                              │ POST /api/v1/events    │
│         ▼                              │ {session, tool, ...}   │
│  ┌──────────────┐                      │                        │
│  │ pet CLI      │◀─── /pet status      │                        │
│  │ (npm/pypi)   │     (HTTPS GET)      │                        │
│  └──────────────┘                      │                        │
└────────────────────────────────────────┼────────────────────────┘
                                         │
                                    HTTPS / JWT
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  VERCEL EDGE NETWORK                                            │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐           │
│  │ /api/v1/events       │    │ /api/v1/pet/[id]     │           │
│  │ (Edge Function)      │    │ (Node Function)      │           │
│  │ - rate-limit         │    │ - read-heavy         │           │
│  │ - validate JWT       │    │ - cached             │           │
│  │ - publish to queue   │    └──────────────────────┘           │
│  └──────────────────────┘                                       │
│         │                                                       │
│  ┌──────────────────────┐    ┌──────────────────────┐           │
│  │ /dashboard (RSC)     │    │ /leaderboard (RSC)   │           │
│  │ (Next.js page)       │    │ (Next.js page)       │           │
│  └──────────────────────┘    └──────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
        │                                       │
        ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│ UPSTASH REDIS        │              │ SUPABASE POSTGRES    │
│ - rate-limit buckets │              │ - users              │
│ - leaderboard ZSET   │              │ - pets               │
│ - in-flight XP       │              │ - quests             │
│ - session cache      │              │ - events (raw log)   │
└──────────────────────┘              │ - quest_progress     │
                                      │ - RLS habilitado     │
                                      └──────────────────────┘
```

### 4.2 Slices verticais (módulos de domínio)

| Slice | Responsabilidade | Tabelas principais |
|---|---|---|
| `auth` | GitHub OAuth via Supabase Auth, JWT issuance pra CLI | `auth.users` (Supabase) |
| `pet` | CRUD do bicho, estágios de evolução, decay de stats | `pets` |
| `quest` | Catálogo de quests, regras de matching de eventos, validação de conclusão | `quests`, `quest_progress` |
| `xp` | Cálculo de XP, level-up, anti-cheat heurístico | `xp_ledger` |
| `telemetry` | Ingestão de eventos do hook, normalização, idempotência | `events` |
| `leaderboard` | Sorted sets no Redis, snapshots periódicos no Postgres | `leaderboard_snapshots` |
| `web` | Dashboard, perfil público, landing | (consome todas) |

---

## 5. Modelo de Dados

### 5.1 Schema Postgres (Supabase)

```sql
-- =========================
-- USERS (extends auth.users)
-- =========================
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,
  github_login TEXT UNIQUE NOT NULL,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  preferences  JSONB DEFAULT '{}'::jsonb
);

-- =========================
-- PETS (1:1 com user no MVP)
-- =========================
CREATE TABLE public.pets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  species      TEXT NOT NULL DEFAULT 'gh0stnel', -- pixel art mascot
  stage        SMALLINT NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 5),
  xp           INT NOT NULL DEFAULT 0,
  hunger       SMALLINT NOT NULL DEFAULT 100 CHECK (hunger BETWEEN 0 AND 100),
  energy       SMALLINT NOT NULL DEFAULT 100 CHECK (energy BETWEEN 0 AND 100),
  happiness    SMALLINT NOT NULL DEFAULT 100 CHECK (happiness BETWEEN 0 AND 100),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id) -- 1 pet por user no MVP
);

-- =========================
-- QUEST CATALOG (seed-driven)
-- =========================
CREATE TABLE public.quests (
  id            TEXT PRIMARY KEY, -- "first-edit", "create-subagent"
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  difficulty    SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  xp_reward     INT NOT NULL,
  required_tool TEXT,    -- ex: "Edit", "Bash", "Task"
  match_rule    JSONB NOT NULL, -- ver §6.2
  category      TEXT NOT NULL, -- "permissions" | "hooks" | "subagents" | ...
  unlocks_after TEXT[]  DEFAULT '{}', -- IDs de pré-requisitos
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =========================
-- QUEST PROGRESS
-- =========================
CREATE TABLE public.quest_progress (
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id     TEXT NOT NULL REFERENCES public.quests(id),
  status       TEXT NOT NULL CHECK (status IN ('locked','available','in_progress','completed')),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  evidence     JSONB, -- snapshot do evento que validou
  PRIMARY KEY (user_id, quest_id)
);

-- =========================
-- EVENTS (raw log, particionado por mês)
-- =========================
CREATE TABLE public.events (
  id          BIGSERIAL,
  user_id     UUID NOT NULL,
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL, -- "PostToolUse", "Stop", etc.
  tool_name   TEXT,
  payload     JSONB NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NOT NULL,
  PRIMARY KEY (id, ingested_at)
) PARTITION BY RANGE (ingested_at);

CREATE UNIQUE INDEX events_idem_idx ON public.events (idempotency_key, ingested_at);

-- =========================
-- XP LEDGER (audit trail)
-- =========================
CREATE TABLE public.xp_ledger (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.profiles(id),
  delta      INT NOT NULL,
  reason     TEXT NOT NULL, -- "quest:first-edit"
  ref_id     TEXT,          -- quest_id ou event_id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- ROW LEVEL SECURITY
-- =========================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "public profiles readable"
  ON public.profiles FOR SELECT USING (true); -- pra perfil compartilhável

CREATE POLICY "users manage own pet"
  ON public.pets FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "users read own progress"
  ON public.quest_progress FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "events: insert via service role only"
  ON public.events FOR INSERT WITH CHECK (false); -- bypass via service_role JWT

CREATE POLICY "users read own events"
  ON public.events FOR SELECT USING (auth.uid() = user_id);
```

### 5.2 Estado no Redis (Upstash)

| Chave | Tipo | TTL | Uso |
|---|---|---|---|
| `rl:events:{user_id}` | Counter | 60s | Rate-limit (max 120 eventos/min) |
| `rl:cli:{user_id}` | Counter | 60s | Rate-limit endpoints CLI |
| `lb:global:weekly` | ZSET | 7d | Leaderboard semanal (score=XP) |
| `lb:global:alltime` | ZSET | — | Leaderboard total |
| `pet:cache:{user_id}` | Hash | 30s | Stats do pet (read-through) |
| `session:{session_id}` | Hash | 24h | Tools usadas na sessão (anti-double-credit) |

---

## 6. CLI — `pet-trainer`

### 6.1 Instalação

```bash
# Node (primary)
npx @specops/pet-trainer init

# Python (wrapper)
pip install pet-trainer
pet-trainer init
```

`init` faz:
1. Abre `https://pet.specops.black/auth/cli` no browser → GitHub OAuth → device code flow → token salvo em `~/.pet-trainer/credentials.json` (perm 0600).
2. Cria/atualiza `.claude/settings.json` no projeto atual com hooks configurados.
3. Adiciona seção `## pet-trainer` ao `CLAUDE.md` do projeto (ou cria) com convenções e slash commands disponíveis.
4. Faz `pet status` final pra confirmar conexão.

### 6.2 Comandos

| Comando | Descrição |
|---|---|
| `pet init` | Setup inicial (hooks + auth) |
| `pet status` | Mostra stats do bicho no terminal (ASCII + cores) |
| `pet quests` | Lista quests disponíveis, em progresso, concluídas |
| `pet feed` | Restaura hunger (custa XP) |
| `pet train <quest-id>` | Marca quest como ativa (foca o aluno) |
| `pet sync` | Flush do buffer offline (se houve eventos sem internet) |
| `pet logout` | Remove credenciais |
| `pet --version` | Versão e status de update |

### 6.3 Slash commands no Claude Code

Instalados em `.claude/commands/` durante `pet init`:

| Slash | Descrição |
|---|---|
| `/pet` | Status rápido inline na conversa |
| `/quest` | Lista quest atual e próximos passos |
| `/feed` | Alimenta o pet (atalho do `pet feed`) |

### 6.4 `.claude/settings.json` gerado

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write|MultiEdit|Bash|Task|Read|Glob|Grep|WebFetch|WebSearch",
      "hooks": [{
        "type": "http",
        "url": "https://pet.specops.black/api/v1/events",
        "timeout": 2,
        "headers": { "Authorization": "Bearer $PET_TRAINER_TOKEN" },
        "allowedEnvVars": ["PET_TRAINER_TOKEN"]
      }]
    }],
    "SessionStart": [{
      "hooks": [{
        "type": "http",
        "url": "https://pet.specops.black/api/v1/events",
        "timeout": 2,
        "headers": { "Authorization": "Bearer $PET_TRAINER_TOKEN" }
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "http",
        "url": "https://pet.specops.black/api/v1/events",
        "timeout": 2,
        "headers": { "Authorization": "Bearer $PET_TRAINER_TOKEN" }
      }]
    }]
  }
}
```

> **Nota:** o token é lido de variável de ambiente, não escrita no JSON, pra evitar leak via commit acidental. `pet init` adiciona `export PET_TRAINER_TOKEN=...` ao shell rc do usuário com confirmação.

---

## 7. Quest Engine

### 7.1 Match Rule (DSL declarativa)

Cada quest tem um `match_rule` JSON que descreve o que precisa acontecer pro evento contar:

```json
{
  "id": "first-edit",
  "title": "Primeiro Edit",
  "description": "Use a tool Edit pela primeira vez",
  "difficulty": 1,
  "xp_reward": 50,
  "required_tool": "Edit",
  "match_rule": {
    "event_type": "PostToolUse",
    "tool_name": "Edit",
    "min_count": 1
  },
  "category": "basics"
}
```

```json
{
  "id": "configure-posttooluse-hook",
  "title": "Configure um Hook PostToolUse",
  "description": "Edite .claude/settings.json adicionando um hook PostToolUse customizado",
  "difficulty": 3,
  "xp_reward": 200,
  "match_rule": {
    "event_type": "PostToolUse",
    "tool_name": "Edit",
    "tool_input.file_path": { "endsWith": ".claude/settings.json" },
    "tool_input.new_string": { "contains": "PostToolUse" },
    "min_count": 1
  },
  "category": "hooks",
  "unlocks_after": ["first-edit"]
}
```

```json
{
  "id": "spawn-subagent",
  "title": "Delegue pra um Subagent",
  "description": "Use a tool Task pra delegar uma tarefa a um subagent",
  "difficulty": 2,
  "xp_reward": 150,
  "match_rule": {
    "event_type": "PostToolUse",
    "tool_name": "Task",
    "min_count": 1
  },
  "category": "subagents",
  "unlocks_after": ["first-edit"]
}
```

Operadores suportados: `equals`, `contains`, `startsWith`, `endsWith`, `regex`, `min_count`, `gte`, `lte`, `in`, `and`, `or`, `not`.

### 7.2 Catálogo MVP (20 quests inaugurais)

| Categoria | Qtd | Exemplos |
|---|---|---|
| Basics | 4 | first-edit, first-bash, first-read, first-grep |
| Permissions | 3 | allow-rule, deny-rule, ask-once |
| Hooks | 4 | posttool-hook, pretool-block, sessionstart-context, stop-validator |
| Slash Commands | 3 | create-command, command-with-args, project-vs-user |
| Subagents | 3 | spawn-task, custom-agent-md, agent-with-tools |
| Skills/MCP | 3 | use-skill, configure-mcp, mcp-tool-call |

### 7.3 Estágios de Evolução

| Stage | XP necessário | Sprite | Unlocks |
|---|---|---|---|
| 1 — Egg | 0 | 🥚 | Quests basics |
| 2 — Hatchling | 200 | 👶 | Permissions, primeiro feed |
| 3 — Apprentice | 800 | 🧒 | Hooks, slash commands |
| 4 — Operator | 2.500 | 🥷 | Subagents, MCP |
| 5 — Architect | 6.000 | 🧙 | Cosmetics, badge no perfil |

---

## 8. API Endpoints

### 8.1 Convenções
- Base URL: `https://pet.specops.black/api/v1`
- Auth: `Authorization: Bearer <jwt>`
- Content-Type: `application/json`
- Idempotência: header `Idempotency-Key` em todos POSTs (UUID por evento)
- Versionamento na URL (`/v1`); breaking changes → `/v2`

### 8.2 Endpoints

| Método | Path | Runtime | Descrição |
|---|---|---|---|
| POST | `/auth/cli/start` | Edge | Inicia device flow, retorna `device_code` |
| POST | `/auth/cli/poll` | Node | CLI faz polling até GitHub OAuth completar |
| POST | `/events` | **Edge** | Hook ingest. Idempotente. Fire-and-forget. |
| GET | `/pet/me` | Edge | Stats do pet do user autenticado (cached 30s) |
| POST | `/pet/me/feed` | Node | Consome XP, restaura hunger |
| GET | `/quests` | Edge | Catálogo + progresso do user |
| POST | `/quests/:id/start` | Node | Marca quest como `in_progress` |
| GET | `/leaderboard?period=weekly` | Edge | Top 100 do ZSET Redis |
| GET | `/profile/:username` | Edge | Perfil público (sem RLS — campos públicos) |

### 8.3 Contrato de `/events` (POST)

**Request body** (enviado pelo hook do Claude Code automaticamente):
```json
{
  "session_id": "abc123",
  "hook_event_name": "PostToolUse",
  "tool_name": "Edit",
  "tool_input": { "file_path": "/path", "old_string": "...", "new_string": "..." },
  "tool_response": { "success": true, "filePath": "/path" }
}
```

**Headers:**
- `Authorization: Bearer <user_jwt>`
- `Idempotency-Key: <hash(session_id + hook_event_name + tool_name + timestamp)>`

**Response (200):**
```json
{ "accepted": true, "request_id": "req_xyz" }
```

**Erros:**
- `401` — token inválido (CLI deve disparar re-auth)
- `429` — rate limit (CLI faz exponential backoff)
- Qualquer 5xx — CLI **não** retenta no hook (fire-and-forget); evento vai pro buffer offline.

### 8.4 Lógica server-side de `/events`

```
1. Validar JWT (Edge-compatible, JWKS cached)
2. Rate-limit check: INCR rl:events:{user_id} EX 60 → reject if > 120
3. Idempotency check: tentativa de SETNX evt:idem:{key} EX 86400 → skip se já existe
4. Persistir em events table (insert assíncrono via Supabase service role)
5. Avaliar match rules ativas pro user → SADD pra session set se match
6. Se quest completou: INCR xp + insert xp_ledger + ZADD leaderboard
7. Retornar 200 (já em <100ms; passo 5 e 6 são síncronos mas otimizados)
```

---

## 9. Frontend (Next.js)

### 9.1 Rotas

| Rota | Tipo | Conteúdo |
|---|---|---|
| `/` | Static | Landing — hero, demo GIF, "How it works", install commands |
| `/docs` | MDX (Static) | Docs as Code — quests, hooks setup, troubleshooting |
| `/dashboard` | RSC + Client | Stats do pet, quests ativas, gráfico de XP semanal |
| `/leaderboard` | RSC | Top 100 weekly + alltime |
| `/u/[username]` | RSC (ISR 60s) | Perfil público — pet, achievements, badge SVG copiável |
| `/auth/cli` | Client | Device code confirmation page |
| `/api/v1/*` | Route Handlers | (ver §8) |

### 9.2 Stack frontend
- **Framework:** Next.js 15 App Router, React 19
- **Styling:** Tailwind 4 + shadcn/ui (componentes copy-paste)
- **State:** Zustand (UI ephemeral) + Tanstack Query (server state)
- **Pixel art:** SVG inline (pet stages como `<svg>` — sem imagem binária no MVP)
- **Charts:** Recharts (XP timeline)
- **Auth client:** `@supabase/ssr`

### 9.3 Conteúdo do perfil público
- Pet sprite + nome + estágio
- XP total, posição no leaderboard
- Quests completadas (badges)
- "README badge" copy-paste markdown: `![pet-trainer](https://pet.specops.black/u/{username}/badge.svg)`

---

## 10. Security & Privacy (Security by Design)

### 10.1 Threat Model (resumo)

| Ameaça | Vetor | Mitigação |
|---|---|---|
| Token leak via repo público | Aluno commita `.claude/settings.json` com token hardcoded | Token vive em env var, nunca no JSON. `pet init` valida `.gitignore`. |
| XP farming / bot | Script chama `/events` em loop | Rate-limit Redis + heurística anti-cheat (eventos suspeitos invalidados, audit no xp_ledger) |
| Injeção em tool_input/output | Conteúdo malicioso no payload do hook | Sanitização antes de persistir; payload tratado como string opaca; nunca executado |
| Vazamento de código do aluno | `tool_input.new_string` pode conter código proprietário | (a) opt-in claro no `pet init`, (b) toggle `--minimal-payload` que envia só metadados (tool_name, file_path hash) |
| RLS bypass | Bug de query expõe dados de outro user | RLS habilitado em todas tabelas; testes de policy obrigatórios em CI |
| Replay attack | Atacante captura request e reenviar | Idempotency-key + JWT com `exp` curto (1h) + rotação |
| Supply chain (npm) | Pacote `@specops/pet-trainer` comprometido | npm provenance + Sigstore signing + 2FA obrigatório no publish |

### 10.2 Privacy
- **Telemetria opt-in granular:**
  - `--telemetry=full` (default): envia tool_input/output truncados a 1KB
  - `--telemetry=minimal`: envia só `tool_name` + hash do file_path
  - `--telemetry=off`: hooks viram no-op (CLI funciona offline, sem progresso)
- **Retention:** eventos raw retidos 90 dias; depois agregados anônimos.
- **DSAR / Right to delete:** endpoint `DELETE /api/v1/me` apaga tudo (cascata via FK).
- **Compliance:** LGPD (Brasil) e GDPR (EU). Política em `/legal/privacy`.

### 10.3 DevSecOps Pipeline (CI/CD)

GitHub Actions em cada PR:

```
┌─ pre-commit (local, via husky) ─────────────────┐
│ - secretlint (gitleaks)                         │
│ - eslint + prettier                             │
└──────────────────────────────────────────────────┘
              │
              ▼
┌─ ci.yml (PR opened/updated) ────────────────────┐
│ 1. install + cache (pnpm)                       │
│ 2. typecheck (tsc --noEmit)                     │
│ 3. lint                                         │
│ 4. unit tests (vitest)                          │
│ 5. integration tests (supabase local)           │
│ 6. RLS policy tests (pgTAP)                     │
│ 7. sast (CodeQL)                                │
│ 8. dependency review (npm audit + snyk)         │
│ 9. preview deploy (Vercel)                      │
│ 10. e2e smoke (playwright contra preview)       │
└──────────────────────────────────────────────────┘
              │
              ▼ (on merge to main)
┌─ deploy.yml ────────────────────────────────────┐
│ 1. supabase migrations (db push)                │
│ 2. vercel deploy --prod                         │
│ 3. publish CLI (semantic-release → npm + pypi)  │
│ 4. sigstore signing                             │
│ 5. smoke prod                                   │
└──────────────────────────────────────────────────┘
```

### 10.4 Secrets management
- Vercel env vars (production / preview separadas)
- Supabase service role key **somente** em runtime (Edge não tem; Node functions sim)
- Nenhum secret em código ou em `.env` versionado
- Rotação trimestral documentada em runbook

---

## 11. Docs as Code

Estrutura de docs versionada no repo:

```
docs/
├── SPEC.md                 # este documento
├── adr/
│   ├── 0001-stack.md
│   ├── 0002-no-microservices.md
│   └── 0003-http-hooks.md
├── runbooks/
│   ├── deploy.md
│   ├── incident-response.md
│   └── rotate-secrets.md
├── quests/                 # uma .md por quest, source of truth do catálogo
│   ├── first-edit.md
│   └── ...
├── api/
│   └── openapi.yaml        # contrato OpenAPI 3.1 gerado a partir do código
└── architecture/
    ├── c4-context.md
    ├── c4-container.md
    └── threat-model.md
```

**Pipeline:**
- MDX renderizado em `/docs` na web (Nextra ou Fumadocs)
- Cada PR que toca código de quest **deve** atualizar a .md correspondente — enforced via CODEOWNERS + PR template
- OpenAPI gerado automaticamente do Zod schemas das route handlers (zod-to-openapi)

---

## 12. Roadmap MVP — 8 semanas / 4 sprints

### Sprint 0 (semana 0, prep)
- Repo monorepo (Turborepo): `apps/web`, `apps/cli`, `packages/domain`, `packages/quest-engine`
- Supabase project criado, migrations base, RLS habilitado
- Vercel project linked, GitHub Actions skeleton
- ADRs 001-003 escritos e mergeados

### Sprint 1 (semanas 1-2) — Foundation
**Goal:** auth + hook ingestion funcionando end-to-end

- [ ] Supabase Auth com GitHub OAuth
- [ ] CLI `init` com device code flow
- [ ] `/api/v1/events` Edge function com idempotência e rate-limit
- [ ] Schema completo + 5 seed quests (basics)
- [ ] Quest engine — avaliação de match_rule
- [ ] `pet status` no CLI (consome `/pet/me`)

**Demo:** Bruno roda `npx @specops/pet-trainer init`, faz um Edit, vê XP subir.

### Sprint 2 (semanas 3-4) — Quest catalog completo
- [ ] 20 quests do MVP (.md + seed)
- [ ] Estágios de evolução (1→5)
- [ ] `/pet feed`, `/pet train`, slash commands
- [ ] Buffer offline + `pet sync`
- [ ] Anti-cheat heurístico básico

### Sprint 3 (semanas 5-6) — Web dashboard
- [ ] Landing page (`/`)
- [ ] Dashboard `/dashboard` (stats + gráfico XP)
- [ ] Leaderboard (`/leaderboard`)
- [ ] Perfil público (`/u/[username]`) + badge SVG
- [ ] Docs as Code rendering (`/docs`)

### Sprint 4 (semanas 7-8) — Hardening + Launch
- [ ] Threat model completo + pentest interno
- [ ] RLS policy tests (pgTAP) — 100% das policies cobertas
- [ ] E2E Playwright (3 fluxos críticos)
- [ ] Observability: Logflare drain, error tracking (Sentry edge)
- [ ] Privacy policy + LGPD/GDPR pages
- [ ] Publish npm + PyPI (provenance + sigstore)
- [ ] Launch: post Instagram (@brunobracaioli), Reddit r/ClaudeAI, HackerNews Show HN, X/Twitter

---

## 13. Open Questions (a resolver antes do Sprint 1)

| # | Pergunta | Owner | Deadline |
|---|---|---|---|
| Q1 | Pet sprite definitivo: gh0stnel ou nova mascote? | Bruno | Sprint 0 |
| Q2 | Username: derivar do GitHub login ou pedir custom? | Bruno | Sprint 1 |
| Q3 | Buffer offline: arquivo JSONL local ou SQLite embedded? | — | Sprint 2 |
| Q4 | Gerar quests dinâmicas via Claude API (fase 2)? | — | pós-MVP |
| Q5 | Suporte a Claude Code rodando dentro de devcontainers (CLAUDE_PROJECT_DIR vs $HOME)? | — | Sprint 1 |
| Q6 | Validar com Anthropic se "pet-trainer" como nome cria conflito de marca | Bruno | Sprint 0 |

---

## 14. Anexos

### A. Estrutura de monorepo

```
pet-trainer/
├── apps/
│   ├── web/                 # Next.js 15 (frontend + API)
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   ├── dashboard/
│   │   │   ├── leaderboard/
│   │   │   ├── u/[username]/
│   │   │   └── api/v1/
│   │   └── ...
│   └── cli/                 # @specops/pet-trainer (npm)
│       └── src/
├── packages/
│   ├── domain/              # types, zod schemas (compartilhado)
│   ├── quest-engine/        # match_rule evaluator (puro, testável)
│   └── ui/                  # shadcn components
├── docs/                    # ver §11
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── .github/workflows/
├── turbo.json
└── pnpm-workspace.yaml
```

### B. Decision log de tech rejeitada

- **Drizzle ORM** considerado, descartado em favor de Supabase client puro (RLS + tipagem auto via `supabase gen types`).
- **tRPC** considerado, descartado — over-engineering pra ~10 endpoints. REST + Zod já dá type-safety suficiente.
- **Bun** considerado pro CLI, descartado — Vercel runtime é Node, manter consistência reduz fricção.

---

**Fim do SPEC v1.0.**
*Próximo passo: criar issues no GitHub a partir das checklists do §12 e abrir o Sprint 0.*
