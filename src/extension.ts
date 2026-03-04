import * as vscode from 'vscode';
import * as path from 'path';
import { DiffTracker } from './diffTracker';
import {
  createProvider,
  LLMProvider,
  ProviderName,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
} from './providers';
import { DecisionStorage } from './decisionStorage';
import { QuestionPanel } from './questionPanel';
import { DecisionsProvider } from './sidebarProvider';
import { DecorationsManager } from './decorationsManager';
import { toErrorMessage } from './utils';

const WATCHED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.rb', '.php', '.swift', '.kt', '.scala',
  '.vue', '.svelte',
  '.css', '.scss', '.less',
  '.sql', '.sh', '.bash', '.zsh',
  '.yaml', '.yml', '.toml',
]);

const DEBOUNCE_MS = 3000;

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel('CodeLedger');
  context.subscriptions.push(out);

  function log(msg: string) {
    out.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  const diffTracker = new DiffTracker();
  let provider: LLMProvider | null = null;
  let storage: DecisionStorage | null = null;
  let decisionsProvider: DecisionsProvider | null = null;
  let decorationsManager: DecorationsManager | null = null;
  const lastQuestionTimes = new Map<string, number>();
  let isAsking = false;
  let pendingDocument: vscode.TextDocument | null = null;
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(book) CodeLedger';
  statusBar.tooltip = 'CodeLedger is active';
  statusBar.command = 'codeledger.searchDecisions';
  statusBar.show();
  context.subscriptions.push(statusBar);

  function cfg() {
    return vscode.workspace.getConfiguration('codeledger');
  }

  function getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
  }

  function normalStatusBar(): void {
    if (!provider) { return; }
    const total = storage
      ? storage.getAllDecisions().reduce((sum, e) => sum + e.decisions.length, 0)
      : 0;
    statusBar.text = total > 0 ? `$(book) CodeLedger (${total})` : '$(book) CodeLedger';
    statusBar.tooltip = `CodeLedger — ${provider.name} · ${total} decision${total !== 1 ? 's' : ''} logged\nClick to search decisions`;
  }

  function initStorage() {
    const root = getWorkspaceRoot();
    if (!root) {
      log('No workspace folder open — storage not initialized.');
      return;
    }
    const folderName = cfg().get<string>('storageFolder', '.codeledger');
    storage = new DecisionStorage(root, folderName);
    log(`Storage: ${root}/${folderName}`);
  }

  function initProvider() {
    const providerName = cfg().get<string>('provider', 'gemini') as ProviderName;

    // Try unified apiKey first, fall back to legacy geminiApiKey
    let apiKey = cfg().get<string>('apiKey', '').trim();
    if (!apiKey) {
      const legacyKey = cfg().get<string>('geminiApiKey', '').trim();
      if (legacyKey && providerName === 'gemini') {
        apiKey = legacyKey;
      }
    }

    if (!apiKey) {
      provider = null;
      log(`No API key set for ${PROVIDER_LABELS[providerName]}. Run "CodeLedger: Set API Key".`);
      statusBar.text = '$(book) CodeLedger (no key)';
      return;
    }

    const modelOverride = cfg().get<string>('model', '').trim() || undefined;

    try {
      provider = createProvider(providerName, apiKey, modelOverride);
      const model = modelOverride || DEFAULT_MODELS[providerName];
      log(`Provider: ${PROVIDER_LABELS[providerName]} (${model})`);
      normalStatusBar();
    } catch (err: unknown) {
      provider = null;
      log(`Failed to initialize provider: ${toErrorMessage(err)}`);
      statusBar.text = '$(book) CodeLedger (error)';
    }
  }

  initStorage();
  initProvider();

  // Snapshot open docs for diffing
  vscode.workspace.textDocuments.forEach(doc => diffTracker.initialize(doc));
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => diffTracker.initialize(doc))
  );

  // Clean up when files are closed (prevents memory leak)
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      const key = doc.uri.fsPath;
      diffTracker.clearFile(key);
      lastQuestionTimes.delete(key);
      const timer = debounceTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(key);
      }
    })
  );

  // Sidebar + decorations (both require storage)
  if (storage) {
    decisionsProvider = new DecisionsProvider(storage);
    vscode.window.registerTreeDataProvider('codeledger.decisionsView', decisionsProvider);

    const dm = new DecorationsManager(storage);
    decorationsManager = dm;
    context.subscriptions.push(dm);

    // Decorate the active editor on startup
    if (vscode.window.activeTextEditor) {
      dm.updateEditor(vscode.window.activeTextEditor);
    }
  }

  // Refresh decorations whenever the active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        decorationsManager?.updateEditor(editor);
      }
    })
  );

  // React to config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('codeledger.provider') ||
        e.affectsConfiguration('codeledger.apiKey') ||
        e.affectsConfiguration('codeledger.geminiApiKey') ||
        e.affectsConfiguration('codeledger.model')
      ) {
        initProvider();
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

  // ── Core logic ────────────────────────────────────────────────────────────

  async function processDocument(document: vscode.TextDocument) {
    const filename = path.basename(document.fileName);
    log(`Processing: ${filename}`);

    if (isAsking) {
      log('Skipped — already showing a question (queued for after).');
      pendingDocument = document;
      return;
    }
    if (!storage) {
      log('Skipped — no workspace open.');
      return;
    }

    const ext = path.extname(document.fileName).toLowerCase();
    if (!WATCHED_EXTENSIONS.has(ext)) {
      log(`Skipped — "${ext}" is not a watched file type.`);
      return;
    }

    const folderName = cfg().get<string>('storageFolder', '.codeledger');
    if (document.fileName.includes(`${path.sep}${folderName}${path.sep}`)) {
      return;
    }

    const cooldownMs = cfg().get<number>('cooldownMinutes', 5) * 60 * 1000;
    const lastTime = lastQuestionTimes.get(document.fileName) ?? 0;
    const msSinceLast = Date.now() - lastTime;
    if (lastTime > 0 && msSinceLast < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - msSinceLast) / 1000);
      log(`Skipped — cooldown for this file (${remaining}s remaining).`);
      return;
    }

    if (!provider) {
      log('Skipped — no LLM provider configured.');
      return;
    }

    const diff = diffTracker.computeDiff(document);
    const minLines = cfg().get<number>('minLinesChanged', 3);
    log(`Diff: ${diff.totalChanged} lines changed (threshold: ${minLines}).`);

    if (diff.totalChanged < minLines || !diff.diffText.trim()) {
      log('Skipped — not enough lines changed.');
      return;
    }

    log(`Sending to ${provider.name}:\n${diff.diffText}`);
    statusBar.text = `$(sync~spin) CodeLedger: asking ${provider.name}...`;
    isAsking = true;

    try {
      const question = await provider.generateQuestion(filename, diff.diffText);

      if (!question) {
        log('LLM returned SKIP — change not interesting enough.');
        return;
      }

      log(`Question: ${question}`);
      lastQuestionTimes.set(document.fileName, Date.now());

      const snippet = diff.addedLines.slice(0, 20).join('\n');
      const answer = await QuestionPanel.ask(question, filename, snippet);

      if (answer && storage) {
        storage.saveDecision(document.fileName, question, answer, snippet);
        decisionsProvider?.refresh();
        normalStatusBar();

        // Refresh decorations for the file just saved
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.fileName === document.fileName) {
          decorationsManager?.updateEditor(activeEditor);
        }

        log('Decision saved.');
        vscode.window.setStatusBarMessage('$(check) CodeLedger: Decision logged', 4000);
      } else {
        log('Skipped by user.');
      }
    } catch (err: unknown) {
      const msg = toErrorMessage(err);
      log(`ERROR: ${msg}`);
      vscode.window.showErrorMessage(`CodeLedger: ${msg}`);
    } finally {
      isAsking = false;
      normalStatusBar();

      // If changes arrived while we were asking, process them now
      if (pendingDocument) {
        const doc = pendingDocument;
        pendingDocument = null;
        scheduleProcessing(doc);
      }
    }
  }

  function scheduleProcessing(document: vscode.TextDocument) {
    const key = document.uri.fsPath;
    const existing = debounceTimers.get(key);
    if (existing) { clearTimeout(existing); }
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key);
        processDocument(document);
      }, DEBOUNCE_MS)
    );
  }

  // Watch keystrokes (debounced) — works with Cursor auto-save
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.contentChanges.length === 0) { return; }
      if (event.document.uri.scheme !== 'file') { return; }
      scheduleProcessing(event.document);
    })
  );

  // On explicit save, fire immediately
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      const key = document.uri.fsPath;
      const existing = debounceTimers.get(key);
      if (existing) {
        clearTimeout(existing);
        debounceTimers.delete(key);
        processDocument(document);
      }
    })
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.selectProvider', async () => {
      const items = Object.entries(PROVIDER_LABELS).map(([key, label]) => ({
        label,
        description: `Default model: ${DEFAULT_MODELS[key as ProviderName]}`,
        providerKey: key,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: 'CodeLedger: Select LLM Provider',
        placeHolder: 'Choose which AI provider to use',
      });

      if (picked) {
        await cfg().update('provider', picked.providerKey, vscode.ConfigurationTarget.Global);
        log(`Provider set to ${picked.label}.`);
        vscode.window.showInformationMessage(`CodeLedger: Provider set to ${picked.label}.`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.setApiKey', async () => {
      const providerName = cfg().get<string>('provider', 'gemini') as ProviderName;
      const label = PROVIDER_LABELS[providerName] ?? providerName;

      const key = await vscode.window.showInputBox({
        title: `CodeLedger: Set ${label} API Key`,
        prompt: `Enter your ${label} API key (stored in VS Code settings)`,
        password: true,
        placeHolder: 'Paste your API key here...',
        validateInput: v => (!v?.trim() ? 'API key cannot be empty' : null),
      });

      if (key?.trim()) {
        await cfg().update('apiKey', key.trim(), vscode.ConfigurationTarget.Global);
        initProvider();
        log('API key updated.');
        vscode.window.showInformationMessage(`CodeLedger: ${label} API key saved.`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.testConnection', async () => {
      if (!provider) {
        vscode.window.showErrorMessage(
          'CodeLedger: No provider configured. Run "CodeLedger: Select Provider" and "CodeLedger: Set API Key".'
        );
        return;
      }
      out.show();
      log(`Testing ${provider.name} connection...`);
      statusBar.text = `$(sync~spin) CodeLedger: testing ${provider.name}...`;
      try {
        const question = await provider.generateQuestion(
          'authService.ts',
          [
            '+ const token = jwt.sign(payload, secret, { expiresIn: "15m" });',
            '+ const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: "7d" });',
            '- const token = jwt.sign(payload, secret);',
          ].join('\n')
        );
        normalStatusBar();
        if (question) {
          log(`Connection OK. Sample: "${question}"`);
          vscode.window.showInformationMessage(`CodeLedger: ${provider.name} connected! "${question}"`);
        } else {
          log('Connection OK but LLM returned SKIP.');
          vscode.window.showInformationMessage(`CodeLedger: ${provider.name} connected (returned SKIP for test).`);
        }
      } catch (err: unknown) {
        normalStatusBar();
        const msg = toErrorMessage(err);
        log(`Connection FAILED: ${msg}`);
        vscode.window.showErrorMessage(`CodeLedger: ${provider.name} failed — ${msg}`);
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
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        decorationsManager?.updateEditor(activeEditor);
      }
      normalStatusBar();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.viewDecision', decision => {
      const title =
        decision.question.length > 50
          ? decision.question.slice(0, 47) + '...'
          : decision.question;
      const panel = vscode.window.createWebviewPanel(
        'codeledger.decisionView',
        title,
        vscode.ViewColumn.Beside,
        {}
      );
      panel.webview.html = buildDecisionViewHtml(decision);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.setCooldown', async () => {
      const current = cfg().get<number>('cooldownMinutes', 5);
      const presets = [1, 5, 10, 30].map(m => ({
        label: `${m} minute${m === 1 ? '' : 's'}`,
        description: m === current ? '(current)' : undefined,
        value: m,
      }));

      const picked = await vscode.window.showQuickPick(
        [...presets, { label: 'Custom...', description: undefined, value: -1 }],
        { title: 'CodeLedger: Set Cooldown Per File', placeHolder: `Current: ${current} min` }
      );

      if (!picked) { return; }

      let minutes = picked.value;
      if (minutes === -1) {
        const input = await vscode.window.showInputBox({
          title: 'CodeLedger: Custom Cooldown',
          prompt: 'Minutes between questions per file (minimum 1)',
          value: String(current),
          validateInput: v => {
            const n = Number(v);
            return (!v || isNaN(n) || n < 1) ? 'Enter a number ≥ 1' : null;
          },
        });
        if (!input) { return; }
        minutes = Math.max(1, Number(input));
      }

      await cfg().update('cooldownMinutes', minutes, vscode.ConfigurationTarget.Global);
      log(`Cooldown set to ${minutes} minute${minutes === 1 ? '' : 's'} per file.`);
      vscode.window.showInformationMessage(`CodeLedger: Cooldown set to ${minutes} min per file.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeledger.searchDecisions', async () => {
      if (!storage) {
        vscode.window.showInformationMessage('CodeLedger: No workspace open.');
        return;
      }

      const allDecisions = storage.getAllDecisions();
      if (allDecisions.length === 0) {
        vscode.window.showInformationMessage('CodeLedger: No decisions logged yet. Start coding!');
        return;
      }

      const items = allDecisions.flatMap(({ filePath, decisions }) =>
        decisions.map(d => ({
          label: d.question.length > 80 ? d.question.slice(0, 77) + '...' : d.question,
          description: filePath,
          detail: d.answer,
          decision: d,
        }))
      );

      const picked = await vscode.window.showQuickPick(items, {
        title: 'CodeLedger: Search Decisions',
        placeHolder: 'Search questions and answers...',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked) {
        vscode.commands.executeCommand('codeledger.viewDecision', picked.decision);
      }
    })
  );

  log('CodeLedger is active. Watching for changes (3s debounce)...');
  out.show(true);
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
  <div class="label">File</div><div class="value meta">${esc(decision.filePath)}</div>
  <div class="label">Logged</div><div class="value meta">${new Date(decision.timestamp).toLocaleString()}</div>
  <div class="label">Question</div><div class="value">${esc(decision.question)}</div>
  <div class="label">Answer</div><div class="value answer">${esc(decision.answer)}</div>
  ${decision.codeSnippet ? `<div class="label">Code Snippet</div><pre>${esc(decision.codeSnippet)}</pre>` : ''}
</body>
</html>`;
}

export function deactivate() {}
