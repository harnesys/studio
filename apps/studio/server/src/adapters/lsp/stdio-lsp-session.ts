import { Buffer } from 'node:buffer';
import { realpathSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginLspServer } from 'harnesys';
import type { LspDiagnostic, LspHover, LspLocation } from 'harnesys/lsp';
import { isRecord, normalizeHover, normalizeLocations, toDiagnostic } from './lsp-messages.ts';
import { spawnServer } from './spawn-lsp-server.ts';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class StdioLspSession {
  private readonly proc: ReturnType<typeof Bun.spawn>;
  private readonly pending = new Map<number, Pending>();
  private readonly diagnosticsByUri = new Map<string, LspDiagnostic[]>();
  private readonly opened = new Set<string>();
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private initialized = false;
  private stderr = '';

  private constructor(
    proc: ReturnType<typeof Bun.spawn>,
    readonly config: PluginLspServer,
    readonly workspaceRoot: string,
  ) {
    this.proc = proc;
    void this.readStdout();
    void this.readStderr();
  }

  static async start(config: PluginLspServer, workspaceRoot: string): Promise<StdioLspSession> {
    const root = realpathSync(workspaceRoot);
    const proc = spawnServer(config, root);
    const session = new StdioLspSession(proc, config, root);
    await session.initialize();
    return session;
  }

  supportsPath(filePath: string): boolean {
    const ext = extname(filePath);
    return ext in this.config.extensionToLanguage;
  }

  async diagnostics(filePath: string): Promise<LspDiagnostic[]> {
    const abs = this.resolvePath(filePath);
    await this.ensureOpen(abs);
    const uri = pathToFileURL(abs).href;
    // The server publishes diagnostics after analyzing the file; wait for the
    // first publish for this uri, then serve from the map on every later call.
    const deadline = Date.now() + 20_000;
    while (!this.diagnosticsByUri.has(uri) && Date.now() < deadline) {
      await sleep(100);
    }
    return this.diagnosticsByUri.get(uri) ?? [];
  }

  async definition(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    const abs = this.resolvePath(filePath);
    await this.ensureOpen(abs);
    const result = await this.request('textDocument/definition', {
      textDocument: { uri: pathToFileURL(abs).href },
      position: { line, character },
    });
    return normalizeLocations(result, this.workspaceRoot);
  }

  async references(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    const abs = this.resolvePath(filePath);
    await this.ensureOpen(abs);
    const result = await this.request('textDocument/references', {
      textDocument: { uri: pathToFileURL(abs).href },
      position: { line, character },
      context: { includeDeclaration: true },
    });
    return normalizeLocations(result, this.workspaceRoot);
  }

  async hover(filePath: string, line: number, character: number): Promise<LspHover | null> {
    const abs = this.resolvePath(filePath);
    await this.ensureOpen(abs);
    const result = await this.request('textDocument/hover', {
      textDocument: { uri: pathToFileURL(abs).href },
      position: { line, character },
    });
    return normalizeHover(result);
  }

  async dispose(): Promise<void> {
    try {
      await this.request('shutdown', null);
      this.notify('exit', undefined);
    } catch {
      // ignore
    }
    try {
      this.proc.kill();
    } catch {
      // ignore
    }
  }

  private async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.workspaceRoot).href;
    await this.request('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: {
        textDocument: {
          synchronization: { didSave: true },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: true },
          references: {},
          publishDiagnostics: {},
        },
        workspace: { workspaceFolders: true },
      },
      workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
      initializationOptions: {},
    });
    this.notify('initialized', {});
    this.initialized = true;
  }

  private resolvePath(filePath: string): string {
    const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(this.workspaceRoot, filePath);
    const rel = relative(this.workspaceRoot, abs);
    if (rel.startsWith('..') || rel === '') {
      // allow files under root; empty relative means the root itself (invalid for docs)
      if (!abs.startsWith(`${this.workspaceRoot}${sep}`) && abs !== this.workspaceRoot) {
        throw new Error(`path outside workspace: ${filePath}`);
      }
    }
    return abs;
  }

  private async ensureOpen(absPath: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('LSP session not initialized');
    }
    if (!this.supportsPath(absPath)) {
      throw new Error(`no language mapping for ${extname(absPath)}`);
    }
    const uri = pathToFileURL(absPath).href;
    if (this.opened.has(uri)) {
      return;
    }
    const text = await Bun.file(absPath).text();
    const languageId = this.config.extensionToLanguage[extname(absPath)] ?? 'plaintext';
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text,
      },
    });
    this.opened.add(uri);
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.write({ jsonrpc: '2.0', id, method, params });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP timeout: ${method}`));
        }
      }, 20_000);
    });
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  private write(message: object): void {
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
    } catch {
      // stream closed
    }
  }

  private async readStderr(): Promise<void> {
    const stderr = this.proc.stderr;
    if (stderr == null || typeof stderr === 'number') {
      return;
    }
    try {
      this.stderr = await new Response(stderr as ReadableStream).text();
    } catch {
      // ignore
    }
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
      this.handleMessage(JSON.parse(body) as Record<string, unknown>);
    }
  }

  private handleMessage(message: Record<string, unknown>): void {
    if (typeof message.id === 'number' || typeof message.id === 'string') {
      const id = typeof message.id === 'number' ? message.id : Number(message.id);
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }
      this.pending.delete(id);
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
        return;
      }
      pending.resolve(message.result);
      return;
    }
    if (message.method === 'textDocument/publishDiagnostics' && isRecord(message.params)) {
      const uri = typeof message.params.uri === 'string' ? message.params.uri : '';
      const list = Array.isArray(message.params.diagnostics) ? message.params.diagnostics : [];
      this.diagnosticsByUri.set(
        uri,
        list
          .map((item) => toDiagnostic(item, uri, this.workspaceRoot))
          .filter((item): item is LspDiagnostic => item !== undefined),
      );
    }
  }
}

function indexOfHeaderEnd(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  const idx = text.indexOf('\r\n\r\n');
  return idx;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
