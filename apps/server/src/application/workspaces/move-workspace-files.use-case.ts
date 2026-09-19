import { relative, resolve } from 'node:path';
import type { WorkspaceMoveItem, WorkspaceMoveResult } from '@harnesys/studio-shared';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';
import { resolveWorkspaceRelPath } from './workspace-path.ts';
export type MoveWorkspaceFilesRequest = {
  workspaceId: string;
  items: WorkspaceMoveItem[];
};
export type MoveWorkspaceFilesInput = {
  execute(req: MoveWorkspaceFilesRequest): Promise<WorkspaceMoveResult>;
};
type ResolvedMove = {
  fromRel: string;
  toRel: string;
  fromAbs: string;
  toAbs: string;
};
const MAX_ITEMS = 500;
export class MoveWorkspaceFilesUseCase implements MoveWorkspaceFilesInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly files: WorkspaceFilesPort,
  ) {}
  async execute(req: MoveWorkspaceFilesRequest): Promise<WorkspaceMoveResult> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    if (req.items.length === 0) {
      throw new ValidationError('items are required');
    }
    if (req.items.length > MAX_ITEMS) {
      throw new ValidationError(`too many items (max ${MAX_ITEMS})`);
    }
    const moves = await this.plan(workspace.path, req.items);
    await this.apply(moves);
    return { moved: moves.map(({ fromRel, toRel }) => ({ from: fromRel, to: toRel })) };
  }
  private async plan(root: string, items: WorkspaceMoveItem[]): Promise<ResolvedMove[]> {
    const moves: ResolvedMove[] = [];
    const destinations = new Set<string>();
    for (const item of items) {
      const fromRel = normalizeRel(item.from);
      const toRel = normalizeRel(item.to);
      if (!fromRel || !toRel) {
        throw new ValidationError('from and to are required');
      }
      if (fromRel === toRel) {
        throw new ValidationError(`source and destination are the same: ${fromRel}`);
      }
      const fromAbs = resolveWorkspaceRelPath(root, fromRel);
      const toAbs = resolveWorkspaceRelPath(root, toRel);
      if (isInside(fromAbs, toAbs)) {
        throw new ConflictError(`cannot move ${fromRel} into itself`);
      }
      if (destinations.has(toAbs)) {
        throw new ConflictError(`duplicate destination: ${toRel}`);
      }
      destinations.add(toAbs);
      const source = await this.files.stat(fromAbs);
      if (!source) {
        throw new NotFoundError(`Source ${fromRel} not found`);
      }
      if (await this.files.stat(toAbs)) {
        throw new ConflictError(`Destination already exists: ${toRel}`);
      }
      moves.push({ fromRel, toRel, fromAbs, toAbs });
    }
    this.rejectNestedMoves(moves);
    return moves;
  }
  private rejectNestedMoves(moves: ResolvedMove[]): void {
    for (const move of moves) {
      const source = resolve(move.fromAbs);
      const nested = moves.find(
        (other) => other !== move && other.fromAbs.startsWith(`${source}/`),
      );
      if (nested) {
        throw new ValidationError(
          `${nested.fromRel} is inside ${move.fromRel}; move the parent only`,
        );
      }
    }
  }
  private async apply(moves: ResolvedMove[]): Promise<void> {
    const done: ResolvedMove[] = [];
    for (const move of moves) {
      try {
        await this.files.move(move.fromAbs, move.toAbs);
        done.push(move);
      } catch (err) {
        await this.rollback(done);
        throw new ConflictError(
          `Failed to move ${move.fromRel}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
  private async rollback(done: ResolvedMove[]): Promise<void> {
    for (const move of [...done].reverse()) {
      try {
        await this.files.move(move.toAbs, move.fromAbs);
      } catch {}
    }
  }
}
function normalizeRel(path: string): string {
  return path.replace(/^\/+/, '').replaceAll('\\', '/').replace(/\/+$/, '');
}
function isInside(parentAbs: string, childAbs: string): boolean {
  const rel = relative(resolve(parentAbs), resolve(childAbs));
  return rel !== '' && !rel.startsWith('..');
}
