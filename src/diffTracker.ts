import * as vscode from 'vscode';

export interface DiffResult {
  addedLines: string[];
  removedLines: string[];
  totalChanged: number;
  diffText: string;
}

export class DiffTracker {
  private previousContent = new Map<string, string>();

  initialize(document: vscode.TextDocument): void {
    const key = document.uri.fsPath;
    if (!this.previousContent.has(key)) {
      this.previousContent.set(key, document.getText());
    }
  }

  computeDiff(document: vscode.TextDocument): DiffResult {
    const key = document.uri.fsPath;
    const newContent = document.getText();
    const oldContent = this.previousContent.get(key) ?? '';

    // Update stored content
    this.previousContent.set(key, newContent);

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    // Identify genuinely new and removed lines (content-based, trimmed)
    const oldTrimmed = new Set(oldLines.map(l => l.trim()).filter(l => l.length > 1));
    const newTrimmed = new Set(newLines.map(l => l.trim()).filter(l => l.length > 1));

    const addedLines: string[] = [];
    const removedLines: string[] = [];

    for (const line of newTrimmed) {
      if (!oldTrimmed.has(line)) {
        addedLines.push(line);
      }
    }

    for (const line of oldTrimmed) {
      if (!newTrimmed.has(line)) {
        removedLines.push(line);
      }
    }

    const diffText = [
      ...addedLines.map(l => `+ ${l}`),
      ...removedLines.map(l => `- ${l}`),
    ].join('\n');

    return {
      addedLines,
      removedLines,
      totalChanged: addedLines.length + removedLines.length,
      diffText,
    };
  }

  clearFile(filePath: string): void {
    this.previousContent.delete(filePath);
  }
}
