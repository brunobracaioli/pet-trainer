// SPEC.md §6.2 — `pet status` reads GET /pet/me and renders ASCII stats.
// /pet/me lands in a later sprint; --mock supports Sprint 1 verification.

import type { Command } from 'commander'
import chalk from 'chalk'
import { apiFetch } from '../lib/api'
import { resolveToken } from '../lib/credentials'

type PetStatus = {
  name: string
  species: string
  stage: number
  xp: number
  hunger: number
  energy: number
  happiness: number
  active_quests: number
}

const STAGE_LABELS = ['', 'Egg 🥚', 'Hatchling 👶', 'Apprentice 🧒', 'Operator 🥷', 'Architect 🧙']
const STAGE_THRESHOLDS = [0, 0, 200, 800, 2500, 6000]

type ColorFn = (text: string) => string

const colorForStat = (value: number): ColorFn => {
  if (value < 20) return chalk.red
  if (value < 50) return chalk.yellow
  return chalk.green
}

const bar = (value: number, max: number, width = 20): string => {
  const safe = Math.max(0, Math.min(max, value))
  const filled = Math.round((safe / max) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const xpToNextStage = (stage: number, xp: number): { needed: number; nextLabel: string } => {
  if (stage >= 5) return { needed: 0, nextLabel: '— max stage —' }
  const next = STAGE_THRESHOLDS[stage + 1] ?? STAGE_THRESHOLDS[STAGE_THRESHOLDS.length - 1] ?? 0
  return { needed: Math.max(0, next - xp), nextLabel: STAGE_LABELS[stage + 1] ?? '' }
}

const renderPet = (pet: PetStatus): void => {
  const stageLabel = STAGE_LABELS[pet.stage] ?? `Stage ${pet.stage}`
  const { needed, nextLabel } = xpToNextStage(pet.stage, pet.xp)
  const lines: string[] = [
    '',
    chalk.bold(pet.name) + chalk.dim(`  (${pet.species})`),
    `  Stage ${pet.stage} — ${stageLabel}`,
    `  XP    ${chalk.cyan(bar(pet.xp, Math.max(pet.xp, 1)))} ${chalk.bold(String(pet.xp))}` +
      (pet.stage < 5 ? chalk.dim(` (${needed} XP to ${nextLabel})`) : ''),
    `  Hunger    ${colorForStat(pet.hunger)(bar(pet.hunger, 100))} ${pet.hunger}/100`,
    `  Energy    ${colorForStat(pet.energy)(bar(pet.energy, 100))} ${pet.energy}/100`,
    `  Happiness ${colorForStat(pet.happiness)(bar(pet.happiness, 100))} ${pet.happiness}/100`,
    '',
    chalk.dim(`  Active quests: ${pet.active_quests}`),
    '',
  ]
  console.log(lines.join('\n'))
}

const MOCK_PET: PetStatus = {
  name: 'Goose',
  species: 'gh0stnel',
  stage: 1,
  xp: 0,
  hunger: 100,
  energy: 100,
  happiness: 100,
  active_quests: 4,
}

const runStatus = async (opts: { mock?: boolean }): Promise<void> => {
  if (opts.mock) {
    renderPet(MOCK_PET)
    console.log(chalk.dim('  (mock data — /pet/me endpoint lands in a later sprint)'))
    return
  }

  const token = await resolveToken()
  if (!token) {
    console.error('No credentials found. Run ' + chalk.cyan('pet init') + ' first.')
    process.exit(1)
  }

  const { status, body } = await apiFetch<PetStatus | { error: string }>('/pet/me', {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })

  if (status === 401) {
    console.error(
      'Token expired or invalid. Run ' + chalk.cyan('pet init') + ' to re-authenticate.'
    )
    process.exit(1)
  }
  if (status !== 200) {
    console.error(`Unexpected response (HTTP ${status})`)
    process.exit(1)
  }
  renderPet(body as PetStatus)
}

export const registerStatus = (program: Command): void => {
  program
    .command('status')
    .description('Show your pet stats: stage, XP, hunger, energy, happiness.')
    .option('--mock', 'render a hardcoded pet without hitting the API (Sprint 1 helper)')
    .action(async (opts: { mock?: boolean }) => {
      try {
        await runStatus(opts)
      } catch (err) {
        console.error(chalk.red('status failed:'), err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })
}
