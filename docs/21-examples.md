# 21. Examples (acceptance fixtures)

**Depends:** 09–13, 16  
**Sources:** PUBLIC_API § A/B; RUNTIME session smoke

Фикстуры для e2e / `check` после реализации.

## A. Coding harness (ReAct)

```ts
const explore = defineAgent({
  id: 'coding.explore.v1',
  version: '1.0.0',
  model: { provider: 'openai', model: 'gpt-4o' },
  prompts: {
    main: {
      instructions:
        'Read-only explorer. Use grep, glob, read_file only. Return concise findings.',
    },
  },
  state: { initial: { messages: '$input.messages' } },
  graph: {
    nodes: {
      start: { type: 'core:start' },
      think: {
        type: 'llm:generate',
        model: 'default',
        prompt: 'main',
        messages: '$state.messages',
        tools: ['grep', 'glob', 'read_file'],
      },
      act: {
        type: 'tool:call',
        calls: '$output.toolCalls',
        concurrency: 'parallel',
      },
      end: { type: 'core:end' },
    },
    edges: [
      { from: 'start', to: 'think' },
      { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
      { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
      { from: 'think', to: 'end' },
      { from: 'act', to: 'think' },
    ],
  },
  budget: { maxSteps: 32, maxTokens: 80_000, deadlineMs: 180_000 },
})

const coding = defineAgent({
  id: 'coding.harness.v1',
  version: '1.0.0',
  model: { provider: 'openai', model: 'gpt-4o' },
  prompts: {
    main: {
      instructions: `
You are a coding agent in a git working tree.
Investigate with read_file/grep/glob before edits.
Use shell for tests, builds, git (approval required).
Use task to spawn coding.explore.v1 for wide read-only search.
Stop when done; final message is the answer.
`.trim(),
    },
  },
  state: { initial: { messages: '$input.messages' } },
  graph: {
    nodes: {
      start: { type: 'core:start' },
      think: {
        type: 'llm:generate',
        model: 'default',
        prompt: 'main',
        messages: '$state.messages',
        tools: ['shell', 'read_file', 'write_file', 'edit_file', 'grep', 'glob', 'task'],
      },
      act: {
        type: 'tool:call',
        calls: '$output.toolCalls',
        concurrency: 'parallel',
        approve: {
          tools: ['shell'],
          reason: 'human_review',
          resumeSchema: {
            type: 'object',
            properties: { approved: { type: 'boolean' }, note: { type: 'string' } },
            required: ['approved'],
          },
        },
      },
      end: { type: 'core:end' },
    },
    edges: [
      { from: 'start', to: 'think' },
      { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
      { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
      { from: 'think', to: 'end' },
      { from: 'act', to: 'think' },
    ],
  },
  budget: {
    maxSteps: 80,
    maxTokens: 200_000,
    deadlineMs: 600_000,
  },
})
```

ReAct think⇄act. `approve` для `shell` → barrier. Host `task` → `state.child` + те же interrupt/budget, что handoff.

## B. Billing pipeline

```ts
const riskReviewer = defineAgent({
  id: 'billing.risk_reviewer.v1',
  version: '1.0.0',
  model: { provider: 'openai', model: 'gpt-4o' },
  prompts: {
    main: {
      instructions:
        'Review refund risk for order {$input.orderId}. Return { ok: boolean, note?: string }.',
    },
  },
  graph: {
    nodes: {
      start: { type: 'core:start' },
      review: {
        type: 'llm:generate',
        model: 'default',
        prompt: 'main',
        output: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            note: { type: 'string' },
          },
          required: ['ok'],
        },
      },
      end: { type: 'core:end', output: '$output' },
    },
    edges: [
      { from: 'start', to: 'review' },
      { from: 'review', to: 'end' },
    ],
  },
  budget: { maxSteps: 4, maxTokens: 8_000, deadlineMs: 30_000 },
})

const billing = defineAgent({
  id: 'billing.support.v3',
  version: '3.0.0',
  model: { provider: 'openai', model: 'gpt-4o' },
  prompts: {
    classify: {
      instructions:
        'Classify refund risk as low or high for order {$input.orderId}.',
    },
  },
  state: { initial: {} },
  graph: {
    nodes: {
      start: { type: 'core:start' },
      classify: {
        type: 'llm:generate',
        model: 'default',
        prompt: 'classify',
        output: {
          type: 'object',
          properties: { risk: { type: 'string', enum: ['low', 'high'] } },
          required: ['risk'],
        },
      },
      prep: {
        type: 'control:assign',
        patch: { riskLevel: '$output.risk', orderId: '$input.orderId' },
      },
      specialist: {
        type: 'control:handoff',
        agentId: 'billing.risk_reviewer.v1',
        input: { orderId: '$state.orderId', risk: '$state.riskLevel' },
      },
      approval: {
        type: 'control:interrupt',
        reason: 'human_review',
        resumeSchema: {
          type: 'object',
          properties: { approved: { type: 'boolean' } },
          required: ['approved'],
        },
      },
      refund: {
        type: 'tool:call',
        name: 'refund',
        args: { orderId: '$state.orderId' },
      },
      end: { type: 'core:end', output: '$output' },
    },
    edges: [
      { from: 'start', to: 'classify' },
      { from: 'classify', to: 'prep' },
      { from: 'prep', to: 'specialist', when: '$state.riskLevel = "high"' },
      { from: 'prep', to: 'refund', when: '$state.riskLevel = "low"' },
      { from: 'prep', to: 'end' },
      { from: 'specialist', to: 'approval', when: '$output.output.ok = false' },
      { from: 'specialist', to: 'refund' },
      { from: 'approval', to: 'refund', when: '$resume.approved = true' },
      { from: 'approval', to: 'end' },
      { from: 'refund', to: 'end' },
    ],
  },
  budget: { maxSteps: 24, maxTokens: 50_000, deadlineMs: 120_000 },
})
```

```ts
await rt.resume(state, {
  type: 'resume',
  interruptId: out.interrupt.interruptId,
  payload: { approved: true },
}, { definition: billing })
```

`$output.output.ok` валиден (handoff). Default на `prep` закрывает `missing_default`. Fixed `refund` → `$output.results[0]`.

## C. Session smoke

```ts
const session = rt.session('coding.cli.v1', { state })
const run = session.send('удали tmp/cache.json', { signal })
for await (const ev of run.stream()) {
  if (ev.type === 'ask') await run.respond(ev.askId, { approved: true })
}
await run.output
```
