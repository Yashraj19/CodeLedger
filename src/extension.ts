import * as vscode from 'vscode';
import * as path from 'path';
import { DiffTracker } from './diffTracker';
import { GeminiClient } from './geminiClient';
import { DecisionStorage } from './decisionStorage';
import { QuestionPanel } from './questionPanel';
import { DecisionsProvider } from './sidebarProvider';

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
  // Output channel — visible in View → Output → CodeLedger
  const out = vscode.window.createOutputChannel('CodeLedger');
  context.subscriptions.push(out);

  function log(msg: string) {
    out.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  const diffTracker = new DiffTracker();
  const geminiClient = new GeminiClient();

  let storage: DecisionStorage | null = null;
  let decisionsProvider: DecisionsProvider | null = null;
  let lastQuestionTime = 0;
  let isAsking = false;

  // Status bar item shows current state
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(book) CodeLedger';
  statusBar.tooltip = 'CodeLedger is active';
  statusBar.show();
  context.subscriptions.push(statusBar);

  function cfg() {
    return vscode.workspace.getConfiguration('codeledger');
  }

  function getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
  }

  function initStorage() {
    const root = getWorkspaceRoot();
    if (!root) {
      log('No workspace folder open — storage not initialized.');
      return;
    }
    const folderName = cfg().get<string>('storageFolder', '.codeledger');
    storage = new DecisionStorage(root, folderName);
    log(`Storage initialized at ${root}/${folderName}`);
  }

  function initGemini() {
    const apiKey = cfg().get<string>('geminiApiKey', '').trim();
    if (apiKey) {
      geminiClient.initialize(apiKey);
      log('Gemini client initialized.');
    } else {
      log('No Gemini API key set. Run "CodeLedger: Set Gemini API Key" from the command palette.');
    }
  }

  initStorage();
  initGemini();

  vscode.workspace.textDocuments.forEach(doc => diffTracker.initialize(doc));
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => diffTracker.initialize(doc))
  );

  if (storage) {
    decisionsProvider = new DecisionsProvider(storage);
    vscode.window.registerTreeDataProvider('codeledger.decisionsView', decisionsProvider);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('codeledger.geminiApiKey')) {
        initGemini();
      }
      if (e.affectsConfiguration('codeledger.storageFolder')) {
        initStorage();
        if (storage && !decisionsProvider) {
          decisionsProvider = new DecisionsProvider(storage);
          vscode.window.registerTreeDataProvider('codeledger.decisionsView', decisionsProvider);
        }
      }
    })
  );

  // ── Core: watch file saves ────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async document => {
      const filename = path.basename(document.fileName);
      log(`Save detected: ${filename}`);

      if (isAsking) {
        log('Skipped — already showing a question.');
        return;
      }

      if (!storage) {
        log('Skipped — no workspace open.');
        return;
      }

      const ext = path.extname(document.fileName).toLowerCase();
      if (!WATCHED_EXTENSIONS.has(ext)) {
        log(`Skipped — file type "${ext}" is not watched.`);
        return;
      }

      const folderName = cfg().get<string>('storageFolder', '.codeledger');
      if (document.fileName.includes(`${path.sep}${folderName}${path.sep}`)) {
        log('Skipped — file is inside .codeledger folder.');
        return;
      }

      const cooldownMs = cfg().get<number>('cooldownMinutes', 5) * 60 * 1000;
      const msSinceLastQuestion = Date.now() - lastQuestionTime;
      if (lastQuestionTime > 0 && msSinceLastQuestion < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - msSinceLastQuestion) / 1000);
        log(`Skipped — cooldown active (${remaining}s remaining).`);
        return;
      }

      if (!geminiClient.isInitialized()) {
        log('Skipped — Gemini API key not set.');
        return;
      }

      const diff = diffTracker.computeDiff(document);
      const minLines = cfg().get<number>('minLinesChanged', 3);
      log(`Diff: ${diff.totalChanged} lines changed (threshold: ${minLines}).`);

      if (diff.totalChanged < minLines || !diff.diffText.trim()) {
        log('Skipped — not enough lines changed.');
        return;
      }

      log(`Sending diff to Gemini...\n${diff.diffText}`);
      statusBar.text = '$(sync~spin) CodeLedger: thinking...';

      isAsking = true;
      try {
        const question = await geminiClient.generateQuestion(filename, diff.diffText);

        if (!question) {
          log('Gemini returned SKIP — change was not interesting enough.');
          statusBar.text = '$(book) CodeLedger';
          return;
        }

        log(`Gemini question: ${question}`);
        lastQuestionTime = Date.now();
        statusBar.text = '$(book) CodeLedger';

        const snippet = diff.addedLines.slice(0, 20).join('\n');
        const answer = await QuestionPanel.ask(question, filename, snippet);

        if (answer && storage) {
          storage.saveDecision(document.fileName, question, answer, snippet);
          decisionsProvider?.refresh();
          log('Decision saved.');
          vscode.window.setStatusBarMessage('$(check) CodeLedger: Decision logged', 4000);
        } else {
          log('Question was skipped by user.');
        }
      } catch (err: any) {
        statusBar.text = '$(book) CodeLedger';
        const msg = err?.message ?? String(err);
        log(`ERROR: ${msg}`);
        vscode.window.showErrorMessage(`CodeLedger: Gemini error — ${msg}`);
      } finally {
        isAsking = false;
        statusBar.text = '$(book) CodeLedger';
      }
    })
  );

  // ── Commands ──────────────────────────────────────────────────────────────

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
        await cfg().update('geminiApiKey', key.trim(), vscode.ConfigurationTarget.Global);
        geminiClient.initialize(key.trim());
        log('API key updated.');
        vscode.window.showInformationMessage('CodeLedger: Gemini API key saved.');
      }
    })
  );

  // Test command — verifies Gemini is reachable and working
  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.testConnection', async () => {
      if (!geminiClient.isInitialized()) {
        vscode.window.showErrorMessage(
          'CodeLedger: No API key set. Run "CodeLedger: Set Gemini API Key" first.'
        );
        return;
      }

      out.show();
      log('Testing Gemini connection...');
      statusBar.text = '$(sync~spin) CodeLedger: testing...';

      try {
        const question = await geminiClient.generateQuestion(
          'authService.ts',
          `+ const token = jwt.sign(payload, secret, { expiresIn: '15m' });\n+ const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: '7d' });`
        );
        statusBar.text = '$(book) CodeLedger';

        if (question) {
          log(`Connection OK. Sample question: "${question}"`);
          vscode.window.showInformationMessage(`CodeLedger: Connected! Sample question: "${question}"`);
        } else {
          log('Connection OK but Gemini returned SKIP for the test diff.');
          vscode.window.showWarningMessage('CodeLedger: Connected, but Gemini skipped the test. Try a larger code change.');
        }
      } catch (err: any) {
        statusBar.text = '$(book) CodeLedger';
        const msg = err?.message ?? String(err);
        log(`Connection FAILED: ${msg}`);
        vscode.window.showErrorMessage(`CodeLedger: Connection failed — ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.showDecisions', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !storage) {
        vscode.window.showInformationMessage('CodeLedger: Open a file in a workspace to see its decisions.');
        return;
      }
      const decisions = storage.getDecisions(editor.document.fileName);
      if (decisions.length === 0) {
        vscode.window.showInformationMessage('CodeLedger: No decisions logged for this file yet.');
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
    vscode.commands.registerCommand('codeledger.viewDecision', decision => {
      const panel = vscode.window.createWebviewPanel(
        'codeledger.decisionView',
        decision.question.slice(0, 50) + '…',
        vscode.ViewColumn.Beside,
        {}
      );
      panel.webview.html = buildDecisionViewHtml(decision);
    })
  );

  log('CodeLedger is active. Watching for file saves...');
  out.show(true); // Show output panel on activation so user can see logs
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
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 24px; line-height: 1.6; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .value { margin-bottom: 20px; font-size: 13px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .answer { background: var(--vscode-editor-inactiveSelectionBackground); border-left: 3px solid var(--vscode-textLink-foreground); padding: 12px 14px; border-radius: 4px; white-space: pre-wrap; }
    pre { background: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-panel-border); padding: 10px 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; font-family: var(--vscode-editor-font-family); white-space: pre-wrap; }
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
  ${decision.codeSnippet ? `<div class="label">Code Snippet</div><pre>${esc(decision.codeSnippet)}</pre>` : ''}
</body>
</html>`;
}

export function deactivate() {}
