declare module 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js' {
  export const StandaloneServices: {
    get<T>(service: new () => T): T;
  };
}
declare module 'monaco-editor/esm/vs/platform/configuration/common/configuration.js' {
  type IConfigurationService = {
    updateValues(values: Array<[string, unknown]>): boolean;
  };
  export const IConfigurationService: {
    new (): IConfigurationService;
  };
}
