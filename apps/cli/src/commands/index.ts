import type { Command } from 'commander'
import { registerInit } from './init'
import { registerStatus } from './status'

export const registerCommands = (program: Command): void => {
  registerInit(program)
  registerStatus(program)
}
