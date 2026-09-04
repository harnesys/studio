export type ToolMessage = {
  role: 'tool';
  toolCallId: string;
  name: string;
  content: string;
};

export function buildToolMessage(call: {
  toolCallId: string;
  name: string;
  content: string;
}): ToolMessage {
  return { role: 'tool', toolCallId: call.toolCallId, name: call.name, content: call.content };
}
