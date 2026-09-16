import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LspServerSpec } from 'harnesys';
import type { LspDiagnostic, LspHover, LspLocation } from 'harnesys/lsp';
import { LspDocuments } from './lsp-documents.ts';
import { isRecord, normalizeHover, normalizeLocations, toDiagnostic } from './lsp-messages.ts';
import { LspStdioTransport } from './lsp-stdio-transport.ts';
import { lspServerRoot, spawnServer } from './spawn-lsp-server.ts';

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

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
  private readonly transport: LspStdioTransport;
  private nextId = 1;
  private initialized = false;

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
    this.transport = new LspStdioTransport(proc, (message) => this.handleMessage(message));
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
    const root = realpathSync(lspServerRoot(config, workspaceRoot));
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
    this.transport.write(message);
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

  /** Watcher push: didClose if this document is open (file moved or deleted on disk). */
  closePath(absPath: string): void {
    try {
      this.requireAlive();
      this.documents.closeIfOpened(this.resolvePath(absPath));
    } catch {
      // path outside the workspace root, dead server, or not initialized — nothing to close
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
    const shutdownTimeoutMs = this.config.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    try {
      await this.request('shutdown', null, shutdownTimeoutMs);
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
    await this.request(
      'initialize',
      {
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
        initializationOptions: this.config.initializationOptions ?? {},
      },
      this.config.startupTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
    this.notifyMessage({ jsonrpc: '2.0', method: 'initialized', params: {} });
    if (this.config.settings !== undefined) {
      this.notifyMessage({
        jsonrpc: '2.0',
        method: 'workspace/didChangeConfiguration',
        params: { settings: this.config.settings },
      });
    }
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

  private request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.transport.write({ jsonrpc: '2.0', id, method, params });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP timeout: ${method}`));
        }
      }, timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    });
  }

  private notifyMessage(message: object): void {
    this.transport.write(message);
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
