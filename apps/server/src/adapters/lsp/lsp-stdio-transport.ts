import { Buffer } from 'node:buffer';

type Message = Record<string, unknown>;
export class LspStdioTransport {
  private buffer = Buffer.alloc(0);
  private stderr = '';
  constructor(
    private readonly proc: ReturnType<typeof Bun.spawn>,
    private readonly onMessage: (message: Message) => void,
  ) {
    void this.readStdout();
    void this.readStderr();
  }
  get stderrText(): string {
    return this.stderr;
  }
  write(message: object): void {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, 'utf8');
    const stdin = this.proc.stdin;
    if (stdin && typeof stdin !== 'number') {
      stdin.write(header);
      stdin.write(body);
    }
  }
  private async readStdout(): Promise<void> {
    const stdout = this.proc.stdout;
    if (stdout == null || typeof stdout === 'number') {
      return;
    }
    const reader = (stdout as ReadableStream<Uint8Array>).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.buffer = Buffer.concat([this.buffer, Buffer.from(value)]);
          this.consumeBuffer();
        }
      }
    } catch {}
  }
  private async readStderr(): Promise<void> {
    const stderr = this.proc.stderr;
    if (stderr == null || typeof stderr === 'number') {
      return;
    }
    try {
      this.stderr = await new Response(stderr as ReadableStream).text();
    } catch {}
  }
  private consumeBuffer(): void {
    while (true) {
      const headerEnd = indexOfHeaderEnd(this.buffer);
      if (headerEnd < 0) {
        return;
      }
      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.byteLength < bodyStart + length) {
        return;
      }
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + length);
      this.onMessage(JSON.parse(body) as Message);
    }
  }
}
function indexOfHeaderEnd(buffer: Buffer): number {
  return buffer.toString('latin1').indexOf('\r\n\r\n');
}
