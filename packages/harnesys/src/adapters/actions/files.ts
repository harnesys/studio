import type { ToolDefinition } from '../../ports/tools.ts';
import { editFileTool } from './edit-file.ts';
import type { FilesOptions } from './files-options.ts';
import { globTool } from './glob.ts';
import { grepTool } from './grep.ts';
import { listDirTool } from './list-dir.ts';
import { readFileTool } from './read-file.ts';
import { writeFileTool } from './write-file.ts';

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
