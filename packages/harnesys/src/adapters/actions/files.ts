import type { ToolDefinition } from '../../ports/tools.ts';
import { editFileTool } from '../../packs/files/edit-file.ts';
import type { FilesOptions } from './files-options.ts';
import { globTool } from '../../packs/files/glob.ts';
import { grepTool } from '../../packs/files/grep.ts';
import { listDirTool } from '../../packs/files/list-dir.ts';
import { readFileTool } from '../../packs/files/read-file.ts';
import { writeFileTool } from '../../packs/files/write-file.ts';

export function files(options: FilesOptions = {}): ToolDefinition[] {
  return [
    readFileTool(options),
    writeFileTool(options),
    editFileTool(options),
    listDirTool(options),
    globTool(options),
    grepTool(options),
  ];
}
