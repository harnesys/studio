import { MODE_ID_RE, MODE_OPS, type PackOverride } from '@harnesys/studio-shared';
import { z } from 'zod';

const modeOpGate = z.enum(['allow', 'ask', 'deny']);

const toolExposureBody = z.enum(['direct', 'deferred']);

/** PackAssignment-литералы (спека 2026-09-15 §3, эталон `packs/registry.ts`):
 *  `true`/объект = вкл, `false`/`null`/отсутствие = выкл. На границе нормализуется
 *  в хранимую форму: `true` → `{}`, `false`/`null` → `null` (явный off).
 *  Объект несёт полный override-набор (`spec` + `disabledTools` + `exposure`). */
const packAssignmentBody = z
  .union([
    z.literal(true),
    z.literal(false),
    z.object({
      spec: z.record(z.string(), z.unknown()).optional(),
      disabledTools: z.array(z.string().trim().min(1)).max(64).optional(),
      exposure: z.record(z.string(), toolExposureBody).optional(),
    }),
    z.null(),
  ])
  .transform(toStoredAssignment);

function toStoredAssignment(value: true | false | PackOverride | null): PackOverride | null {
  if (value === true) {
    return {};
  }
  if (value === false || value === null) {
    return null;
  }
  return value;
}

const agentModeBody = z.object({
  id: z.string().regex(MODE_ID_RE, 'lowercase letters, digits, dash').max(48),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  instructions: z.string().max(6000).optional(),
  skills: z.array(z.string().trim().min(1)).max(32).optional(),
  packs: z.record(z.string(), packAssignmentBody).optional(),
  disabledTools: z.array(z.string().trim().min(1)).max(64).optional(),
  exposure: z.record(z.string(), toolExposureBody).optional(),
  permissions: z.partialRecord(z.enum(MODE_OPS), modeOpGate).optional(),
});

const generationBody = z
  .object({
    temperature: z.number().optional(),
    topP: z.number().optional(),
    topK: z.number().optional(),
    frequencyPenalty: z.number().optional(),
    presencePenalty: z.number().optional(),
    seed: z.number().optional(),
    maxTokens: z.number().optional(),
  })
  .nullable()
  .optional();

const toolOutputBody = z
  .object({
    maxChars: z.number().int().positive().optional(),
    headChars: z.number().int().positive().optional(),
    tailChars: z.number().int().positive().optional(),
  })
  .nullable()
  .optional();

const budgetBody = z
  .object({
    maxSteps: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    deadlineMs: z.number().int().positive().optional(),
    policy: z.enum(['ask', 'error']).optional(),
  })
  .nullable()
  .optional();

const capabilitiesBody = z.record(z.string(), packAssignmentBody).optional();

/** Поле `tools` (allowlist) удалена из модели; приход имени на wire — явный отказ. */
const removedToolsBody = z
  .unknown()
  .refine((value) => value === undefined, 'tools removed; use sources')
  .optional();

const permissionsBody = z.record(z.string(), modeOpGate).nullable().optional();

const colorBody = z.string().trim().min(1).max(32).nullable().optional();

const portRefObject = z.object({
  name: z.string().trim().min(1),
  version: z.string().optional(),
  spec: z.record(z.string(), z.unknown()).optional(),
});

const portRefBody = portRefObject.nullable();

const compactionBody = portRefBody.optional();

const agentGraphBody = z
  .object({
    nodes: z.record(z.string(), z.object({ type: z.string() }).passthrough()),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        when: z.unknown().optional(),
      }),
    ),
    layout: z
      .object({
        rankdir: z.enum(['TB', 'LR']),
        positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
      })
      .optional(),
    toolPolicy: z.literal('explicit').optional(),
  })
  .optional();

const timeoutS = z.number().int().positive().optional();

// harnesys `HookHandler` union minus `inline` (host code; never from HTTP input).
const hookHandlerBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('command'),
    command: z.string().trim().min(1),
    args: z.array(z.string()).optional(),
    timeoutS,
    async: z.boolean().optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal('http'),
    url: z.string().trim().min(1),
    headers: z.record(z.string(), z.string()).optional(),
    timeoutS,
  }),
  z.object({
    type: z.literal('mcp_tool'),
    server: z.string().trim().min(1),
    tool: z.string().trim().min(1),
    input: z.record(z.string(), z.string()).optional(),
    timeoutS,
  }),
  z.object({
    type: z.literal('prompt'),
    prompt: z.string().trim().min(1),
    model: z.string().optional(),
    timeoutS,
  }),
  z.object({
    type: z.literal('agent'),
    prompt: z.string().trim().min(1),
    model: z.string().optional(),
    timeoutS,
  }),
]);

const hooksBindingBody = z.object({
  event: z.string().trim().min(1),
  matcher: z.string().optional(),
  handler: hookHandlerBody,
  when: z.enum(['agent', 'mode']).optional(),
});

const hooksBody = z.array(hooksBindingBody).max(32).optional();
const enabledPluginsBody = z.record(z.string(), z.boolean()).optional();

export const createAgentBody = z.object({
  name: z.string().trim().min(1),
  parentId: z.string().trim().min(1).nullish(),
  modelId: z.string().nullish(),
  role: z.string().nullish(),
  instructions: z.string().nullish(),
  effort: z.string().trim().min(1).nullish(),
  generation: generationBody,
  toolOutput: toolOutputBody,
  budget: budgetBody,
  capabilities: capabilitiesBody,
  permissions: permissionsBody,
  color: colorBody,
  compaction: compactionBody,
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
  tools: removedToolsBody,
  graph: agentGraphBody,
  hooks: hooksBody,
  enabledPlugins: enabledPluginsBody,
  defaultModeId: z.string().regex(MODE_ID_RE).max(48).nullish(),
  modes: z.array(agentModeBody).max(24).optional(),
});

export const updateAgentBody = z.object({
  name: z.string().trim().nullish(),
  modelId: z.string().nullish(),
  role: z.string().nullish(),
  instructions: z.string().nullish(),
  effort: z.string().trim().min(1).nullish(),
  generation: generationBody,
  toolOutput: toolOutputBody,
  budget: budgetBody,
  capabilities: capabilitiesBody,
  permissions: permissionsBody,
  color: colorBody,
  compaction: compactionBody,
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
  tools: removedToolsBody,
  graph: agentGraphBody,
  hooks: hooksBody,
  enabledPlugins: enabledPluginsBody,
  defaultModeId: z.string().regex(MODE_ID_RE).max(48).nullish(),
  modes: z.array(agentModeBody).max(24).optional(),
});

export const createAgentFromPresetBody = z.object({
  presetId: z.string().trim().min(1),
  /** Create as spawn delegate under this top-level agent. */
  parentId: z.string().trim().min(1).nullish(),
});
