import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LspServerSpec } from 'harnesys';
import type { LspDiagnostic } from 'harnesys/lsp';
import { isRecord } from './lsp-messages.ts';
export class LspDocuments {
  private readonly opened = new Set<string>();
  private readonly diagnosticsByUri = new Map<string, LspDiagnostic[]>();
  private readonly versions = new Map<string, number>();
  private readonly mtimeByUri = new Map<string, number>();
  private readonly lastSentText = new Map<string, string>();
  constructor(
    private readonly config: LspServerSpec,
    private readonly send: (message: object) => void,
  ) {}
  supportsPath(filePath: string): boolean {
    const ext = extname(filePath);
    return ext in this.config.extensionToLanguage;
  }
  async diagnostics(absPath: string): Promise<LspDiagnostic[]> {
    await this.ensureOpen(absPath);
    await this.syncIfChangedOnDisk(absPath);
    const uri = pathToFileURL(absPath).href;
    const deadline = Date.now() + 20000;
    while (!this.diagnosticsByUri.has(uri) && Date.now() < deadline) {
      await sleep(100);
    }
    return this.diagnosticsByUri.get(uri) ?? [];
  }
  async ensureOpen(absPath: string): Promise<void> {
    const uri = pathToFileURL(absPath).href;
    if (this.opened.has(uri)) {
      return;
    }
    if (!this.supportsPath(absPath)) {
      throw new Error(`no language mapping for ${extname(absPath)}`);
    }
    const text = await Bun.file(absPath).text();
    const languageId = this.config.extensionToLanguage[extname(absPath)] ?? 'plaintext';
    this.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: { uri, languageId, version: this.bumpVersion(uri), text },
      },
    });
    this.opened.add(uri);
    this.lastSentText.set(uri, text);
    this.mtimeByUri.delete(uri);
  }
  async syncIfChangedOnDisk(absPath: string): Promise<void> {
    const uri = pathToFileURL(absPath).href;
    if (!this.opened.has(uri)) {
      return;
    }
    let mtimeMs: number | undefined;
    try {
      mtimeMs = (await stat(absPath)).mtimeMs;
    } catch {
      return;
    }
    if (this.mtimeByUri.get(uri) === mtimeMs) {
      return;
    }
    const text = await Bun.file(absPath).text();
    if (this.lastSentText.get(uri) !== text) {
      this.sendDidChange(uri, text);
    }
    this.mtimeByUri.set(uri, mtimeMs);
  }
  async syncIfOpened(absPath: string): Promise<void> {
    if (this.opened.has(pathToFileURL(absPath).href)) {
      await this.syncIfChangedOnDisk(absPath);
    }
  }
  closeIfOpened(absPath: string): void {
    const uri = pathToFileURL(absPath).href;
    if (!this.opened.has(uri)) {
      return;
    }
    this.send({
      jsonrpc: '2.0',
      method: 'textDocument/didClose',
      params: { textDocument: { uri } },
    });
    this.opened.delete(uri);
    this.diagnosticsByUri.delete(uri);
    this.versions.delete(uri);
    this.mtimeByUri.delete(uri);
    this.lastSentText.delete(uri);
  }
  normalizeOutgoingDidChange(message: Record<string, unknown>): void {
    if (message.method !== 'textDocument/didChange' || !isRecord(message.params)) {
      return;
    }
    const doc = message.params.textDocument;
    if (!isRecord(doc) || typeof doc.uri !== 'string') {
      return;
    }
    doc.version = this.bumpVersion(doc.uri);
    const changes = message.params.contentChanges;
    if (Array.isArray(changes) && changes.length > 0) {
      const change = changes[changes.length - 1];
      if (isRecord(change) && typeof change.text === 'string' && change.range === undefined) {
        this.lastSentText.set(doc.uri, change.text);
      }
    }
    this.diagnosticsByUri.delete(doc.uri);
  }
  publish(
    uri: string,
    rawList: unknown[],
    toDiagnostic: (raw: unknown, uri: string) => LspDiagnostic | undefined,
  ): void {
    this.diagnosticsByUri.set(
      uri,
      rawList
        .map((item) => toDiagnostic(item, uri))
        .filter((item): item is LspDiagnostic => item !== undefined),
    );
  }
  private sendDidChange(uri: string, text: string): void {
    this.send({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri, version: this.bumpVersion(uri) },
        contentChanges: [{ text }],
      },
    });
    this.lastSentText.set(uri, text);
    this.diagnosticsByUri.delete(uri);
  }
  private bumpVersion(uri: string): number {
    const next = (this.versions.get(uri) ?? 0) + 1;
    this.versions.set(uri, next);
    return next;
  }
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
