// SPEC.md §6.4 — credential storage. Token never lives in a JSON file
// committed to a repo; ~/.pet-trainer/credentials.json is chmod 600.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

export type Credentials = {
  token: string
  expires_at: number
}

const CREDENTIALS_DIR = path.join(os.homedir(), '.pet-trainer')
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json')

export const writeCredentials = async (creds: Credentials): Promise<void> => {
  await fs.mkdir(CREDENTIALS_DIR, { recursive: true, mode: 0o700 })
  await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  })
  // Belt-and-suspenders: ensure 0600 even if umask drifted.
  await fs.chmod(CREDENTIALS_PATH, 0o600)
}

export const readCredentials = async (): Promise<Credentials | null> => {
  try {
    const raw = await fs.readFile(CREDENTIALS_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Credentials
    if (typeof parsed.token === 'string' && typeof parsed.expires_at === 'number') {
      return parsed
    }
    return null
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// Resolution order: PET_TRAINER_TOKEN env var, then credentials file.
export const resolveToken = async (): Promise<string | null> => {
  const fromEnv = process.env.PET_TRAINER_TOKEN
  if (fromEnv && fromEnv.length > 0) return fromEnv
  const creds = await readCredentials()
  return creds?.token ?? null
}
