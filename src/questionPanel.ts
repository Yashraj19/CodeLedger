import * as vscode from 'vscode';

export class QuestionPanel {
  private static currentPanel: QuestionPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private resolvePromise: ((answer: string | null) => void) | undefined;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;

    this.panel.onDidDispose(() => {
      QuestionPanel.currentPanel = undefined;
      this.resolvePromise?.(null);
    });

    this.panel.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'submit':
          this.resolvePromise?.(message.answer);
          this.panel.dispose();
          break;
        case 'skip':
          this.resolvePromise?.(null);
          this.panel.dispose();
          break;
      }
    });
  }

  static async ask(
    question: string,
    filename: string,
    codeSnippet: string
  ): Promise<string | null> {
    // Dispose any existing panel so we don't stack them
    if (QuestionPanel.currentPanel) {
      QuestionPanel.currentPanel.panel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      'codeledger.question',
      'CodeLedger',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: false }
    );

    const questionPanel = new QuestionPanel(panel);
    QuestionPanel.currentPanel = questionPanel;
    panel.webview.html = questionPanel.buildHtml(question, filename, codeSnippet);

    return new Promise<string | null>(resolve => {
      questionPanel.resolvePromise = resolve;
    });
  }

  private buildHtml(question: string, filename: string, codeSnippet: string): string {
    const q = this.esc(question);
    const f = this.esc(filename);
    const s = this.esc(codeSnippet);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeLedger</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 28px 24px;
      line-height: 1.6;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 22px;
    }

    .logo {
      font-size: 15px;
      font-weight: 700;
      color: var(--vscode-textLink-foreground);
      letter-spacing: -0.01em;
    }

    .file-badge {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-family: var(--vscode-editor-font-family);
    }

    .section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .question-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-left: 3px solid var(--vscode-textLink-foreground);
      border-radius: 4px;
      padding: 14px 16px;
      margin-bottom: 20px;
    }

    .question-card .section-label {
      color: var(--vscode-textLink-foreground);
      margin-bottom: 8px;
    }

    .question-text {
      font-size: 13px;
    }

    .code-block {
      margin-bottom: 20px;
    }

    .code-block .section-label {
      color: var(--vscode-descriptionForeground);
    }

    pre {
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 10px 12px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      max-height: 140px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .answer-label {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }

    textarea {
      width: 100%;
      min-height: 90px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 10px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: vertical;
      outline: none;
      margin-bottom: 14px;
    }

    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    textarea::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    button {
      padding: 7px 14px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      font-weight: 500;
    }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .hint {
      margin-left: auto;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="logo">CodeLedger</span>
    <span class="file-badge">${f}</span>
  </div>

  <div class="question-card">
    <div class="section-label">Decision Question</div>
    <div class="question-text">${q}</div>
  </div>

  ${s ? `
  <div class="code-block">
    <div class="section-label answer-label">Changed Code</div>
    <pre>${s}</pre>
  </div>
  ` : ''}

  <div class="section-label answer-label">Your Reasoning</div>
  <textarea
    id="answer"
    placeholder="Explain your thinking — trade-offs, alternatives you considered, constraints... (Enter to submit, Shift+Enter for new line)"
    autofocus
  ></textarea>

  <div class="actions">
    <button class="btn-primary" onclick="submit()">Log Decision</button>
    <button class="btn-secondary" onclick="skip()">Skip</button>
    <span class="hint">Saved to .codeledger/ — commit it with your code</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const textarea = document.getElementById('answer');

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });

    function submit() {
      const answer = textarea.value.trim();
      if (!answer) {
        textarea.style.borderColor = 'var(--vscode-inputValidation-errorBorder)';
        textarea.placeholder = 'Please write something before submitting...';
        textarea.focus();
        return;
      }
      vscode.postMessage({ command: 'submit', answer });
    }

    function skip() {
      vscode.postMessage({ command: 'skip' });
    }
  </script>
</body>
</html>`;
  }

  private esc(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
