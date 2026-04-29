// SPEC.md §6.1, §6.3, §6.4 — `pet init` six-step onboarding.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import open from 'open'
import { apiFetch, API_BASE } from '../lib/api'
import { writeCredentials } from '../lib/credentials'
import { writeOrMergeSettings } from '../lib/settings-merge'

type StartResponse = {
  device_code: string
  verification_uri: string
  expires_in: number
}

type PollResponse =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'complete'; token: string; expires_in: number }

const SLASH_COMMANDS: Record<string, string> = {
  'pet.md': 'Run the pet status command and show its output inline.\n',
  'quest.md': 'Run the pet quests command and show my active quests.\n',
  'feed.md': 'Run the pet feed command to restore my pet hunger.\n',
}

const writeSlashCommands = async (cwd: string): Promise<string[]> => {
  const dir = path.join(cwd, '.claude', 'commands')
  await fs.mkdir(dir, { recursive: true })
  const written: string[] = []
  for (const [name, body] of Object.entries(SLASH_COMMANDS)) {
    const target = path.join(dir, name)
    try {
      await fs.access(target)
      // Already present — keep init idempotent.
    } catch {
      await fs.writeFile(target, body)
      written.push(name)
    }
  }
  return written
}

const PET_TRAINER_SECTION_HEADER = '## pet-trainer'

const appendClaudeMd = async (cwd: string): Promise<{ skipped: boolean }> => {
  const target = path.join(cwd, 'CLAUDE.md')
  let existing = ''
  try {
    existing = await fs.readFile(target, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  if (existing.includes(PET_TRAINER_SECTION_HEADER)) {
    return { skipped: true }
  }
  const block = [
    '',
    PET_TRAINER_SECTION_HEADER,
    '',
    'pet-trainer is wired into this project. Every Claude Code tool call posts to',
    `the pet-trainer Edge Function and contributes XP toward your pet evolution.`,
    '',
    '- `/pet` — show your pet status inline',
    '- `/quest` — list active quests',
    '- `/feed` — restore your pet hunger using XP',
    '',
    `The hook reads the bearer token from the \`PET_TRAINER_TOKEN\` env var. If you`,
    `unset that variable, all pet-trainer hooks become no-ops without breaking`,
    `your Claude Code session.`,
    '',
  ].join('\n')
  await fs.writeFile(target, existing + block)
  return { skipped: false }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const pollUntilComplete = async (
  deviceCode: string,
  expiresIn: number
): Promise<{ token: string; expiresIn: number }> => {
  const deadline = Date.now() + expiresIn * 1000
  while (Date.now() < deadline) {
    const { status, body } = await apiFetch<PollResponse>('/auth/cli/poll', {
      method: 'POST',
      body: JSON.stringify({ device_code: deviceCode }),
    })
    if (status === 410 || (body && (body as PollResponse).status === 'expired')) {
      throw new Error('Device code expired before authorization completed.')
    }
    if (status === 200 && (body as PollResponse).status === 'complete') {
      const ok = body as Extract<PollResponse, { status: 'complete' }>
      return { token: ok.token, expiresIn: ok.expires_in }
    }
    await sleep(5000)
  }
  throw new Error('Authorization timed out.')
}

const runInit = async (): Promise<void> => {
  const cwd = process.cwd()
  console.log(chalk.bold('pet-trainer init'))
  console.log(chalk.dim(`API base: ${API_BASE}`))

  const startSpinner = ora('Requesting device code...').start()
  const startResp = await apiFetch<StartResponse>('/auth/cli/start', { method: 'POST' })
  if (startResp.status !== 200) {
    startSpinner.fail('Could not start device flow')
    throw new Error(`/auth/cli/start returned HTTP ${startResp.status}`)
  }
  startSpinner.succeed('Device code issued')
  const { device_code, verification_uri } = startResp.body

  console.log()
  console.log(`Open ${chalk.cyan(verification_uri)} in your browser to authorize.`)

  try {
    await open(verification_uri)
  } catch {
    // §13 Q5 — devcontainers and headless shells: print URL only.
    console.log(chalk.dim('(could not auto-open browser; visit the URL above manually)'))
  }

  const pollSpinner = ora('Waiting for browser authorization...').start()
  let token: string
  let expiresIn: number
  try {
    const result = await pollUntilComplete(device_code, startResp.body.expires_in)
    token = result.token
    expiresIn = result.expiresIn
    pollSpinner.succeed('Authorized')
  } catch (err) {
    pollSpinner.fail('Authorization failed')
    throw err
  }

  await writeCredentials({ token, expires_at: Date.now() + expiresIn * 1000 })
  console.log(chalk.green('✓') + ' wrote ~/.pet-trainer/credentials.json (mode 0600)')

  const settingsResult = await writeOrMergeSettings(cwd)
  if (settingsResult.created) {
    console.log(chalk.green('✓') + ' created .claude/settings.json with hooks')
  } else if (settingsResult.merged) {
    console.log(chalk.green('✓') + ' merged pet-trainer hooks into .claude/settings.json')
  } else {
    console.log(chalk.dim('•') + ' .claude/settings.json already wired — nothing to do')
  }

  const slashWritten = await writeSlashCommands(cwd)
  if (slashWritten.length > 0) {
    console.log(
      chalk.green('✓') +
        ` installed slash commands: ${slashWritten.map((n) => '/' + n.replace('.md', '')).join(', ')}`
    )
  } else {
    console.log(chalk.dim('•') + ' slash commands already present')
  }

  const claudeResult = await appendClaudeMd(cwd)
  if (claudeResult.skipped) {
    console.log(chalk.dim('•') + ' CLAUDE.md already has a pet-trainer section')
  } else {
    console.log(chalk.green('✓') + ' appended pet-trainer section to CLAUDE.md')
  }

  console.log()
  console.log(
    chalk.bold('Done.') + ' Set ' + chalk.cyan('PET_TRAINER_TOKEN') + ' in your shell rc:'
  )
  console.log(
    chalk.dim('   export PET_TRAINER_TOKEN=$(jq -r .token ~/.pet-trainer/credentials.json)')
  )
  console.log()
  console.log('Run ' + chalk.cyan('pet status') + ' to verify the connection.')
}

export const registerInit = (program: Command): void => {
  program
    .command('init')
    .description('Authorize the CLI and install Claude Code hooks for this project.')
    .action(async () => {
      try {
        await runInit()
      } catch (err) {
        console.error(chalk.red('init failed:'), err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })
}
