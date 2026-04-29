// SPEC.md §6.4 — generate or merge .claude/settings.json idempotently.
// Running `pet init` twice must NOT duplicate hooks.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export const PET_TRAINER_HOOK_URL = 'https://pet.specops.black/api/v1/events'

const buildPostToolUseHook = () => ({
  matcher: 'Edit|Write|MultiEdit|Bash|Task|Read|Glob|Grep|WebFetch|WebSearch',
  hooks: [
    {
      type: 'http',
      url: PET_TRAINER_HOOK_URL,
      timeout: 2,
      headers: { Authorization: 'Bearer $PET_TRAINER_TOKEN' },
      allowedEnvVars: ['PET_TRAINER_TOKEN'],
    },
  ],
})

const buildLifecycleHook = () => ({
  hooks: [
    {
      type: 'http',
      url: PET_TRAINER_HOOK_URL,
      timeout: 2,
      headers: { Authorization: 'Bearer $PET_TRAINER_TOKEN' },
    },
  ],
})

const TEMPLATE = {
  hooks: {
    PostToolUse: [buildPostToolUseHook()],
    SessionStart: [buildLifecycleHook()],
    Stop: [buildLifecycleHook()],
  },
}

type HookEntry = { type?: string; url?: string; [k: string]: unknown }
type HookGroup = { hooks?: HookEntry[]; [k: string]: unknown }

const groupAlreadyHasPetHook = (group: HookGroup | undefined): boolean => {
  if (!group?.hooks || !Array.isArray(group.hooks)) return false
  return group.hooks.some((h) => h?.url === PET_TRAINER_HOOK_URL)
}

export const mergeSettingsContent = (
  existing: Record<string, unknown> | null
): { content: Record<string, unknown>; changed: boolean } => {
  if (!existing) {
    return { content: TEMPLATE as unknown as Record<string, unknown>, changed: true }
  }
  const next: Record<string, unknown> = { ...existing }
  const hooks = (next.hooks as Record<string, HookGroup[] | undefined> | undefined) ?? {}
  let changed = false

  for (const [event, group] of Object.entries(TEMPLATE.hooks)) {
    const current = (hooks[event] as HookGroup[] | undefined) ?? []
    const alreadyHas = current.some(groupAlreadyHasPetHook)
    if (alreadyHas) continue
    hooks[event] = [...current, ...(group as unknown as HookGroup[])]
    changed = true
  }

  next.hooks = hooks
  return { content: next, changed }
}

export const writeOrMergeSettings = async (
  cwd: string
): Promise<{ created: boolean; merged: boolean; skipped: boolean }> => {
  const settingsPath = path.join(cwd, '.claude', 'settings.json')
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })

  let existing: Record<string, unknown> | null = null
  try {
    const raw = await fs.readFile(settingsPath, 'utf8')
    existing = JSON.parse(raw) as Record<string, unknown>
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }

  const { content, changed } = mergeSettingsContent(existing)
  if (!changed && existing !== null) {
    return { created: false, merged: false, skipped: true }
  }

  await fs.writeFile(settingsPath, JSON.stringify(content, null, 2) + '\n')
  return { created: existing === null, merged: existing !== null, skipped: false }
}
