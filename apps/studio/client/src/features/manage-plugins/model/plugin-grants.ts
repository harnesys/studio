import type {
  GrantClass,
  PluginComponentSummary,
  PluginGrantSelection,
  PluginKind,
} from '@harnesys/studio-shared';

export const GRANT_CLASS_LIST: GrantClass[] = ['content', 'process', 'network'];

export const GRANT_CLASS_DESCRIPTIONS: Record<GrantClass, string> = {
  content: 'Read skills, commands, agents, settings and prompt hooks',
  process: 'Run hook commands, stdio servers, LSP servers and monitors',
  network: 'Call external urls from http hooks and remote MCP servers',
};

const CONTENT_KINDS: PluginKind[] = [
  'skill',
  'command',
  'agent',
  'setting-default',
  'config-option',
];
const PROCESS_KINDS: PluginKind[] = ['lsp-server', 'monitor', 'path-entry'];
/** Hook class depends on the handler, MCP class on the transport; the summary carries neither. */
const ALL_CLASSES: GrantClass[] = GRANT_CLASS_LIST;

/** Three-way checkbox state: true = granted, false = explicitly denied, missing = unset. */
export function grantCheckboxState(
  selection: PluginGrantSelection,
  grantClass: GrantClass,
): boolean | 'indeterminate' {
  const value = selection[grantClass];
  if (value === true) {
    return true;
  }
  if (value === false) {
    return 'indeterminate';
  }
  return false;
}

export function toggleGrantClass(
  selection: PluginGrantSelection,
  grantClass: GrantClass,
  granted: boolean,
): PluginGrantSelection {
  const next: PluginGrantSelection = { ...selection };
  if (granted) {
    next[grantClass] = true;
  } else {
    delete next[grantClass];
  }
  return next;
}

export function grantedClasses(selection: PluginGrantSelection): GrantClass[] {
  return GRANT_CLASS_LIST.filter((grantClass) => selection[grantClass] === true);
}

/** Classes needed to unblock every native component; hook/MCP kinds contribute conservatively. */
export function requiredGrantClasses(components: PluginComponentSummary[]): GrantClass[] {
  const required = new Set<GrantClass>();
  for (const component of components) {
    if (component.status !== 'native') {
      continue;
    }
    if (CONTENT_KINDS.includes(component.kind)) {
      required.add('content');
    } else if (PROCESS_KINDS.includes(component.kind)) {
      required.add('process');
    } else {
      for (const grantClass of ALL_CLASSES) {
        required.add(grantClass);
      }
    }
  }
  return GRANT_CLASS_LIST.filter((grantClass) => required.has(grantClass));
}
