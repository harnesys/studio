/**
 * Единый реестр кодов диагностики плагинов: манифест/валидация,
 * containment/конформанс, компоненты, рантайм/гранты/lsp/hooks.
 */
export type PluginDiagnosticCode =
  // манифест/валидация
  | 'unsupported_schema_version'
  | 'invalid_manifest'
  | 'unknown_manifest_field'
  // containment/конформанс
  | 'path_escapes_root'
  | 'invalid_plugin_name'
  | 'invalid_component_path'
  // компоненты
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
  // рантайм/гранты/lsp/hooks
  | 'blocked_by_grant'
  | 'needs_server_approval'
  | 'hook_failed'
  | 'hook_timeout'
  | 'hook_invalid_output'
  | 'lsp_shadowed'
  | 'source_unsupported'
  | 'invalid_command_form';

/** Запись диагностики загрузки/валидации плагина. Для inert-компонентов — свободная строка inertReason; стандартное значение для hook-типа `agent`: `needs_verifier_runtime`. */
export type PluginDiagnostic = {
  level: 'error' | 'warning';
  code: PluginDiagnosticCode;
  message: string;
  path?: string;
};
