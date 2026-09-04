export type ToolMessage = {
  role: 'tool';
  toolCallId: string;
  name: string;
  content: string;
};

export function buildToolMessageRaw(
  toolCallId: string,
  name: string,
  content: string,
): ToolMessage {
  return { role: 'tool', toolCallId, name, content };
}

export function buildToolMessage(call: {
  toolCallId: string;
  name: string;
  content: string;
}): ToolMessage {
  return buildToolMessageRaw(call.toolCallId, call.name, call.content);
}
