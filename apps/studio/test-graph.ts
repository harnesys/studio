import { validateStructural } from 'harnesys';

const diags = validateStructural({
  id: 'test',
  prompts: { main: { instructions: 'test' } },
  graph: {
    nodes: {
      start: { type: 'core:start' },
      think: { type: 'llm:generate', prompt: 'main', messages: '$state.messages' },
      end: { type: 'core:end' }
    },
    edges: [
      { from: 'start', to: 'think' },
      { from: 'think', to: 'end' }
    ]
  }
});
const errors = diags.filter((d: any) => d.severity === 'error');
console.log('Errors:', errors.map((e: any) => e.code + ': ' + e.message));
