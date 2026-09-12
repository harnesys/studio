import { Buffer } from 'node:buffer';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LspServerSpec } from 'harnesys';
import type { LspDiagnostic, LspHover, LspLocation } from 'harnesys/lsp';
import { LspDocuments } from './lsp-documents.ts';
import { isRecord, normalizeHover, normalizeLocations, toDiagnostic } from './lsp-messages.ts';
import { spawnServer } from './spawn-lsp-server.ts';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type MessageListener = (message: Record<string, unknown>) => void;

export class StdioLspSession {
  private readonly proc: ReturnType<typeof Bun.spawn>;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<MessageListener>();
  private readonly documents: LspDocuments;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private initialized = false;
  private stderr = '';

  private constructor(
    proc: ReturnType<typeof Bun.spawn>,
    readonly config: LspServerSpec,
    readonly workspaceRoot: string,
  ) {
    this.proc = proc;
    this.documents = new LspDocuments(config, (message) => this.notifyMessage(message));
    this.exited = proc.exited.then((code) => {
      this.dead = true;
      return code;
    });
    void this.readStdout();
    void this.readStderr();
  }

  /** Resolves when the server process exits (crash or dispose). */
  readonly exited: Promise<number | null>;

  private dead = false;

  private requireAlive(): void {
    if (this.dead) {
      throw new Error(`LSP server "${this.config.serverId}" has exited`);
    }
  }

  static async start(config: LspServerSpec, workspaceRoot: string): Promise<StdioLspSession> {
    const root = realpathSync(workspaceRoot);
    const proc = spawnServer(config, root);
    const session = new StdioLspSession(proc, config, root);
    await session.initialize();
    return session;
  }

  supportsPath(filePath: string): boolean {
    return this.documents.supportsPath(filePath);
  }

  /**
   * Subscribe to server messages that are NOT responses to internal requests:
   * notifications (publishDiagnostics, window/*) and responses to client-originated
   * (string-id) requests. Returns an unsubscribe function.
   */
  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Forward a raw client message (notifications, or requests with string ids). */
  sendRaw(message: Record<string, unknown>): void {
    this.requireAlive();
    this.documents.normalizeOutgoingDidChange(message);
    this.write(message);
  }

  diagnostics(filePath: string): Promise<LspDiagnostic[]> {
    this.requireAlive();
    return this.documents.diagnostics(this.resolvePath(filePath));
  }

  /**
   * Push disk content to the server if this document is open and changed externally
   * (watcher-driven). Outside-root paths and unknown docs are ignored.
   */
  async syncPath(absPath: string): Promise<void> {
    try {
      this.requireAlive();
      await this.documents.syncIfOpened(this.resolvePath(absPath));
    } catch {
      // path outside the workspace root, dead server, or not initialized — nothing to sync
    }
  }

  definition(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    return this.positional(
      this.resolvePath(filePath),
      'textDocument/definition',
      { position: { line, character } },
      (result) => normalizeLocations(result, this.workspaceRoot),
    );
  }

  references(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    return this.positional(
      this.resolvePath(filePath),
      'textDocument/references',
      {
        position: { line, character },
        context: { includeDeclaration: true },
      },
      (result) => normalizeLocations(result, this.workspaceRoot),
    );
  }

  hover(filePath: string, line: number, character: number): Promise<LspHover | null> {
    return this.positional(
      this.resolvePath(filePath),
      'textDocument/hover',
      { position: { line, character } },
      (result) => normalizeHover(result),
    );
  }

  async dispose(): Promise<void> {
    try {
      await this.request('shutdown', null);
      this.notifyMessage({ jsonrpc: '2.0', method: 'exit' });
    } catch {
      // ignore
    }
    try {
      this.proc.kill();
    } catch {
      // ignore
    }
  }

  private async ensureOpen(absPath: string): Promise<string> {
    this.requireAlive();
    if (!this.initialized) {
      throw new Error('LSP session not initialized');
    }
    await this.documents.ensureOpen(absPath);
    return absPath;
  }

  private async positional<T>(
    absPath: string,
    method: 'textDocument/definition' | 'textDocument/references' | 'textDocument/hover',
    params: Record<string, unknown>,
    normalize: (result: unknown) => T,
  ): Promise<T> {
    this.requireAlive();
    await this.documents.syncIfChangedOnDisk(await this.ensureOpen(absPath));
    const result = await this.request(method, {
      textDocument: { uri: pathToFileURL(absPath).href },
      ...params,
    });
    return normalize(result);
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
    this.notifyMessage({ jsonrpc: '2.0', method: 'initialized', params: {} });
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

  private notifyMessage(message: object): void {
    this.write(message);
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
    // Responses to internal (numeric-id) requests are consumed here; everything
    // else — notifications and responses to string-id client requests — also
    // goes to listeners.
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(JSON.stringify(message.error)));
          return;
        }
        pending.resolve(message.result);
        return;
      }
    }
    if (
      message.method === 'textDocument/publishDiagnostics' &&
      isRecord(message.params) &&
      typeof message.params.uri === 'string'
    ) {
      const uri = message.params.uri;
      const list = Array.isArray(message.params.diagnostics) ? message.params.diagnostics : [];
      this.documents.publish(uri, list, (raw, docUri) =>
        toDiagnostic(raw, docUri, this.workspaceRoot),
      );
    }
    this.emit(message);
  }

  private emit(message: Record<string, unknown>): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        // listener errors must not break the session
      }
    }
  }
}

function indexOfHeaderEnd(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  const idx = text.indexOf('\r\n\r\n');
  return idx;
}
