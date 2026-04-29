#!/usr/bin/env node

/**
 * docs-reminder.js
 * Hook PostToolUse — injeta lembrete no contexto do Claude
 * para verificar se algum arquivo em docs/ precisa ser atualizado.
 *
 * Instalação:
 *   - Salve em .claude/hooks/docs-reminder.js
 *   - Configure .claude/settings.json conforme settings.json gerado
 *
 * Como funciona:
 *   O Claude Code passa os dados da tool use via stdin (JSON).
 *   Este script lê o arquivo modificado, ignora casos irrelevantes
 *   (docs/, testes, configs), e imprime uma mensagem para stdout.
 *   O Claude Code injeta esse stdout no contexto como lembrete.
 */

const fs = require("fs");

// Lê o input do Claude Code via stdin
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));

process.stdin.on("end", () => {
  let toolUse = {};

  try {
    toolUse = JSON.parse(input);
  } catch {
    // Se não conseguir parsear, sai silenciosamente
    process.exit(0);
  }

  const filePath =
    toolUse?.tool_input?.path ||
    toolUse?.tool_input?.file_path ||
    "";

  // Ignora se não tiver path identificável
  if (!filePath) process.exit(0);

  // Ignora modificações dentro de docs/ (evita loop)
  if (filePath.includes("/docs/") || filePath.startsWith("docs/")) {
    process.exit(0);
  }

  // Ignora arquivos que raramente impactam docs
  const IGNORED_PATTERNS = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /\.lock$/,
    /\.log$/,
    /node_modules/,
    /\.env/,
    /\.git\//,
    /dist\//,
    /build\//,
    /coverage\//,
    /\.claude\//,
  ];

  const shouldIgnore = IGNORED_PATTERNS.some((pattern) =>
    pattern.test(filePath)
  );

  if (shouldIgnore) process.exit(0);

  // Extrai só o nome do arquivo para a mensagem
  const fileName = filePath.split("/").pop();

  // Mensagem injetada no contexto do Claude
  const reminder = `
---
[HOOK docs-reminder]
O arquivo "${fileName}" (${filePath}) foi modificado.
Verifique se algum documento em docs/ precisa ser atualizado para refletir essa mudança.
Se sim, atualize antes de continuar. Se não, ignore este aviso e prossiga.
---
`.trim();

  process.stdout.write(reminder);
  process.exit(0);
});