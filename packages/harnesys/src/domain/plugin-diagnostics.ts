export type PluginDiagnosticCode =
  | 'unsupported_schema_version'
  | 'invalid_manifest'
  | 'unknown_manifest_field'
  | 'path_escapes_root'
  | 'invalid_plugin_name'
  | 'invalid_component_path'
  | 'invalid_component'
  | 'inert_component'
  | 'event_unsupported'
  | 'handler_type_unsupported'
  | 'unsupported_isolation'
  | 'unsupported_transport'
  | 'unsupported_frontmatter_field'
  | 'unsupported_tool'
  | 'claude_tool_unmapped'
  | 'unresolved_model'
  | 'server_config_invalid'
  | 'dependency_unsatisfied'
  | 'dependency_cycle'
  | 'blocked_by_grant'
  | 'needs_server_approval'
  | 'hook_failed'
  | 'hook_timeout'
  | 'hook_invalid_output'
  | 'lsp_shadowed'
  | 'source_unsupported'
  | 'invalid_command_form';
export type PluginDiagnostic = {
  level: 'error' | 'warning';
  code: PluginDiagnosticCode;
  message: string;
  path?: string;
};
