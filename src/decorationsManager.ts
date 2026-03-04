import * as vscode from 'vscode';
import { DecisionStorage, Decision } from './decisionStorage';

export class DecorationsManager {
  private readonly decorationType: vscode.TextEditorDecorationType;

  constructor(private readonly storage: DecisionStorage) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: '  ⬥',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
      },
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.warningForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  updateEditor(editor: vscode.TextEditor): void {
    const decisions = this.storage.getDecisions(editor.document.fileName);
    const lineMap = new Map<number, Decision[]>();

    for (const decision of decisions) {
      const line = this.findLine(editor.document, decision.codeSnippet);
      if (line !== null) {
        const existing = lineMap.get(line) ?? [];
        existing.push(decision);
        lineMap.set(line, existing);
      }
    }

    const decorations: vscode.DecorationOptions[] = [];
    for (const [lineNum, lineDecisions] of lineMap) {
      const parts = lineDecisions.map(d => `**Q:** ${d.question}\n\n**A:** ${d.answer}`);
      const hover = new vscode.MarkdownString(parts.join('\n\n---\n\n'));
      hover.isTrusted = false;
      const lineLength = editor.document.lineAt(lineNum).text.length;
      decorations.push({
        range: new vscode.Range(lineNum, lineLength, lineNum, lineLength),
        hoverMessage: hover,
      });
    }

    editor.setDecorations(this.decorationType, decorations);
  }

  private findLine(doc: vscode.TextDocument, codeSnippet: string): number | null {
    // Sort longest-first: longer lines are more unique and less likely to false-match
    const candidates = codeSnippet
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 10)
      .sort((a, b) => b.length - a.length);

    if (candidates.length === 0) return null;

    for (const candidate of candidates) {
      for (let i = 0; i < doc.lineCount; i++) {
        if (doc.lineAt(i).text.trim() === candidate) {
          return i;
        }
      }
    }
    return null;
  }

  dispose(): void {
    this.decorationType.dispose();
  }
}
