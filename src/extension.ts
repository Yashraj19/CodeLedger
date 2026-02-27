import * as vscode from 'vscode';
import * as path from 'path';
import { DiffTracker } from './diffTracker';
import { GeminiClient } from './geminiClient';
import { DecisionStorage } from './decisionStorage';
import { QuestionPanel } from './questionPanel';
import { DecisionsProvider } from './sidebarProvider';

// File extensions CodeLedger monitors
const WATCHED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.rb', '.php', '.swift', '.kt', '.scala',
  '.vue', '.svelte',
  '.css', '.scss', '.less',
  '.sql', '.sh', '.bash', '.zsh',
  '.yaml', '.yml', '.toml',
]);

export function activate(context: vscode.ExtensionContext) {
  const diffTracker = new DiffTracker();
  const geminiClient = new GeminiClient();

  let storage: DecisionStorage | null = null;
  let decisionsProvider: DecisionsProvider | null = null;
  let lastQuestionTime = 0;
  let isAsking = false;

  function cfg() {
    return vscode.workspace.getConfiguration('codeledger');
  }

  function getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
  }

  function initStorage() {
    const root = getWorkspaceRoot();
    if (!root) return;
    const folderName = cfg().get<string>('storageFolder', '.codeledger');
    storage = new DecisionStorage(root, folderName);
  }

  function initGemini() {
    const apiKey = cfg().get<string>('geminiApiKey', '').trim();
    if (apiKey) {
      geminiClient.initialize(apiKey);
    }
  }

  // Boot
  initStorage();
  initGemini();

  // Track content of all already-open documents
  vscode.workspace.textDocuments.forEach(doc => diffTracker.initialize(doc));
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => diffTracker.initialize(doc))
  );

  // Register sidebar
  if (storage) {
    decisionsProvider = new DecisionsProvider(storage);
    vscode.window.registerTreeDataProvider(
      'codeledger.decisionsView',
      decisionsProvider
    );
  }

  // React to config changes (e.g. user sets API key via settings UI)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('codeledger.geminiApiKey')) {
        initGemini();
      }
      if (e.affectsConfiguration('codeledger.storageFolder')) {
        initStorage();
        if (storage && !decisionsProvider) {
          decisionsProvider = new DecisionsProvider(storage);
          vscode.window.registerTreeDataProvider(
            'codeledger.decisionsView',
            decisionsProvider
          );
        }
      }
    })
  );

  // ── Core: watch file saves ─────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async document => {
      if (!storage || isAsking) return;

      // Only watch supported code file types
      const ext = path.extname(document.fileName).toLowerCase();
      if (!WATCHED_EXTENSIONS.has(ext)) return;

      // Never watch files inside the storage folder itself
      const folderName = cfg().get<string>('storageFolder', '.codeledger');
      if (document.fileName.includes(`${path.sep}${folderName}${path.sep}`)) return;

      // Respect cooldown to avoid interrupting flow
      const cooldownMs = cfg().get<number>('cooldownMinutes', 5) * 60 * 1000;
      if (Date.now() - lastQuestionTime < cooldownMs) return;

      // Need an API key to proceed
      if (!geminiClient.isInitialized()) return;

      // Compute what changed
      const diff = diffTracker.computeDiff(document);
      const minLines = cfg().get<number>('minLinesChanged', 3);
      if (diff.totalChanged < minLines || !diff.diffText.trim()) return;

      isAsking = true;
      try {
        const filename = path.basename(document.fileName);
        const question = await geminiClient.generateQuestion(filename, diff.diffText);

        if (!question) return;

        lastQuestionTime = Date.now();

        const snippet = diff.addedLines.slice(0, 20).join('\n');
        const answer = await QuestionPanel.ask(question, filename, snippet);

        if (answer && storage) {
          storage.saveDecision(document.fileName, question, answer, snippet);
          decisionsProvider?.refresh();
          vscode.window.setStatusBarMessage('$(check) CodeLedger: Decision logged', 4000);
        }
      } catch (err) {
        console.error('CodeLedger error:', err);
      } finally {
        isAsking = false;
      }
    })
  );

  // ── Commands ───────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title: 'CodeLedger: Set Gemini API Key',
        prompt: 'Enter your Google Gemini API key (stored in VS Code settings)',
        password: true,
        placeHolder: 'AIza...',
        validateInput: v => (!v?.trim() ? 'API key cannot be empty' : null),
      });

      if (key?.trim()) {
        await cfg().update(
          'geminiApiKey',
          key.trim(),
          vscode.ConfigurationTarget.Global
        );
        geminiClient.initialize(key.trim());
        vscode.window.showInformationMessage('CodeLedger: Gemini API key saved.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.showDecisions', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !storage) {
        vscode.window.showInformationMessage(
          'CodeLedger: Open a file in a workspace to see its decisions.'
        );
        return;
      }
      const decisions = storage.getDecisions(editor.document.fileName);
      if (decisions.length === 0) {
        vscode.window.showInformationMessage(
          'CodeLedger: No decisions logged for this file yet.'
        );
        return;
      }
      vscode.commands.executeCommand('codeledger.decisionsView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.refresh', () => {
      decisionsProvider?.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeledger.viewDecision',
      (decision) => {
        const panel = vscode.window.createWebviewPanel(
          'codeledger.decisionView',
          decision.question.slice(0, 50) + '…',
          vscode.ViewColumn.Beside,
          {}
        );
        panel.webview.html = buildDecisionViewHtml(decision);
      }
    )
  );

  console.log('CodeLedger is active.');
}

function buildDecisionViewHtml(decision: {
  filePath: string;
  timestamp: string;
  question: string;
  answer: string;
  codeSnippet?: string;
}): string {
  const esc = (t: string) =>
    t
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px;
      line-height: 1.6;
    }
    .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .value { margin-bottom: 20px; font-size: 13px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .answer {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 12px 14px;
      border-radius: 4px;
      white-space: pre-wrap;
    }
    pre {
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border);
      padding: 10px 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="label">File</div>
  <div class="value meta">${esc(decision.filePath)}</div>

  <div class="label">Logged</div>
  <div class="value meta">${new Date(decision.timestamp).toLocaleString()}</div>

  <div class="label">Question</div>
  <div class="value">${esc(decision.question)}</div>

  <div class="label">Answer</div>
  <div class="value answer">${esc(decision.answer)}</div>

  ${decision.codeSnippet ? `
  <div class="label">Code Snippet</div>
  <pre>${esc(decision.codeSnippet)}</pre>
  ` : ''}
</body>
</html>`;
}

export function deactivate() {}
