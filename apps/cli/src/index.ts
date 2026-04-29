#!/usr/bin/env node
// pet-trainer — Terminal Tamagotchi for Claude Code (SPEC.md §6).
// Entry point: dispatches to the registered commands via Commander.

import { Command } from 'commander'
import { registerCommands } from './commands/index'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg: { version: string } = require('../package.json')

const program = new Command()
program
  .name('pet')
  .description('Terminal Tamagotchi that gamifies learning Claude Code')
  .version(pkg.version)

registerCommands(program)

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
