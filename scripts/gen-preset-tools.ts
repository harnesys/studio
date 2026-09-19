#!/usr/bin/env bun
/**
 * Regenerates explicit `tools` for the shipped agent presets (closed-world
 * materialization). tools := union(Pack.meta.tools over the preset's
 * capabilities) + ['ask_user','map','wait']; `llm:generate` nodes without a
 * `tools` key get that list + load_tools/load_skill/Skill. An explicit
 * `tools: []` (pure decision node) is never touched.
 *
 * Run:    bun run scripts/gen-preset-tools.ts
 * Dry:    bun run scripts/gen-preset-tools.ts --check
 *         exit 0 = presets match; exit 1 = drift list printed, nothing written.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  agentsCapability,
  coreCapability,
  episodicMemoryCapability,
  fetchCapability,
  filesCapability,
  knowledgeMemoryCapability,
  type PackMeta,
  pinMemoryCapability,
  planCapability,
  schedulerCapability,
  semanticMemoryCapability,
  shellCapability,
  threadsCapability,
  webhookCapability,
  webSearchCapability,
} from '../packages/harnesys/index.ts'
import { lspCapability } from '../packages/harnesys/lsp.ts'

type PackEntry = { name: string; meta: PackMeta }

const PACKS: PackEntry[] = [
  coreCapability,
  filesCapability,
  shellCapability,
  fetchCapability,
  webSearchCapability,
  lspCapability,
  planCapability,
  agentsCapability,
  threadsCapability,
  schedulerCapability,
  webhookCapability,
  episodicMemoryCapability,
  semanticMemoryCapability,
  knowledgeMemoryCapability,
  pinMemoryCapability,
]

const BY_NAME = new Map(PACKS.map((pack) => [pack.name, pack]))
const PRESETS_DIR = join(import.meta.dirname, '..', 'apps', 'studio', 'assets', 'presets', 'agents')
const SERVICE_TOOLS = ['load_tools', 'load_skill', 'Skill']

type PresetFile = {
  capabilities?: Record<string, unknown>
  graph?: { nodes: Record<string, { type: string; tools?: string[] }> }
  tools?: string[]
}

function materialize(file: string, preset: PresetFile): void {
  const names = new Set<string>(['ask_user', 'map', 'wait'])
  for (const packName of Object.keys(preset.capabilities ?? {})) {
    const pack = BY_NAME.get(packName)
    if (pack === undefined) {
      throw new Error(`${file}: unknown pack "${packName}"`)
    }
    for (const tool of pack.meta.tools) {
      names.add(tool.name)
    }
  }
  const tools = [...names].sort()
  preset.tools = tools
  for (const node of Object.values(preset.graph?.nodes ?? {})) {
    if (node.type === 'llm:generate' && node.tools === undefined) {
      node.tools = [...tools, ...SERVICE_TOOLS]
    }
  }
}

function main(): number {
  const check = process.argv.includes('--check')
  const drifted: string[] = []
  for (const file of readdirSync(PRESETS_DIR).filter((name) => name.endsWith('.json')).sort()) {
    const path = join(PRESETS_DIR, file)
    const current = readFileSync(path, 'utf8')
    const preset = JSON.parse(current) as PresetFile
    materialize(file, preset)
    const next = `${JSON.stringify(preset, null, 2)}\n`
    if (current !== next) {
      drifted.push(file)
      if (!check) {
        writeFileSync(path, next)
        console.log(`${file}: rewritten, tools=${(preset.tools ?? []).length}`)
      }
    } else {
      console.log(`${file}: up to date, tools=${(preset.tools ?? []).length}`)
    }
  }
  if (check && drifted.length > 0) {
    console.error(`--check: ${drifted.length} preset(s) out of date: ${drifted.join(', ')}`)
    return 1
  }
  return 0
}

process.exit(main())
