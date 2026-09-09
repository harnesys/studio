import type { ToolDefinition } from '../../ports/tools.ts';
import { editFileTool } from './fs/edit-file.ts';
import type { FilesOptions } from './files-options.ts';
import { globTool } from './terminal/glob.ts';
import { grepTool } from './terminal/grep.ts';
import { listDirTool } from './fs/list-dir.ts';
import { readFileTool } from './fs/read-file.ts';
import { writeFileTool } from './fs/write-file.ts';

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
