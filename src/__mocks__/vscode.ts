// Vitest alias resolves `import * as vscode from 'vscode'` to this file
export const window = {
  showErrorMessage: () => {},
  showInformationMessage: () => {},
};
export const Uri = {
  file: (p: string) => ({ fsPath: p }),
};
// Types are erased at runtime; no runtime export needed for TextDocument
