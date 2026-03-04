# CodeLedger

A VS Code extension that captures the *why* behind your code decisions — not just the what.

Engineers forget why they made certain choices. New teammates inherit code with no context. CodeLedger fixes this by watching your code as you write it, asking you smart questions about the decisions you make, and storing your answers alongside the code — so the reasoning never gets lost.

---

## How it works

1. You write code normally
2. After you stop typing for 3 seconds, CodeLedger computes what changed
3. If the change is substantial, it sends the diff to your chosen LLM
4. The LLM detects meaningful decisions and generates a specific question
5. A panel opens beside your editor asking you to explain your reasoning
6. Your answer is saved to `.codeledger/` in your workspace
7. Commit that folder — the context travels with the codebase

---

## Supported LLM Providers

| Provider | Default Model | API Key |
|---|---|---|
| **Google Gemini** | `gemini-2.0-flash` | [ai.google.dev](https://ai.google.dev/) |
| **OpenAI** | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic Claude** | `claude-haiku-4-5-20251001` | [console.anthropic.com](https://console.anthropic.com/) |

You can override the model via the `codeledger.model` setting.

---

## Getting started

### Install from source

```bash
git clone https://github.com/Yashraj19/CodeLedger.git
cd CodeLedger
npm install
npm run compile
```

Open the folder in VS Code / Cursor and press **F5** to launch the Extension Development Host.

Or install the pre-built `.vsix`:
1. `Cmd+Shift+P` → **Extensions: Install from VSIX...**
2. Select `codeledger-0.2.0.vsix`

### Configure

1. `Cmd+Shift+P` → **CodeLedger: Select Provider** — pick Gemini, OpenAI, or Claude
2. `Cmd+Shift+P` → **CodeLedger: Set API Key** — paste your API key
3. `Cmd+Shift+P` → **CodeLedger: Test Connection** — verify it works

Then open any project and start coding. When you make a non-trivial change, CodeLedger will ask you about it.

---

## Configuration

All settings are under `codeledger.*` in VS Code settings:

| Setting | Default | Description |
|---|---|---|
| `codeledger.provider` | `gemini` | LLM provider (`gemini`, `openai`, `claude`) |
| `codeledger.apiKey` | `""` | API key for the selected provider |
| `codeledger.model` | `""` | Model override (empty = provider default) |
| `codeledger.minLinesChanged` | `3` | Min lines changed to trigger a question |
| `codeledger.cooldownMinutes` | `5` | Min minutes between questions |
| `codeledger.storageFolder` | `.codeledger` | Folder for decision logs |

---

## Commands

| Command | Description |
|---|---|
| `CodeLedger: Select Provider` | Choose between Gemini, OpenAI, or Claude |
| `CodeLedger: Set API Key` | Set API key for the active provider |
| `CodeLedger: Test Connection` | Verify the LLM connection works |
| `CodeLedger: Show Decisions for Current File` | Focus sidebar on current file's decisions |
| `CodeLedger: Refresh` | Refresh the decisions sidebar |

---

## Decision storage format

Decisions are stored as JSON in `.codeledger/`, one file per source file:

```json
{
  "file": "src/auth/tokenService.ts",
  "decisions": [
    {
      "id": "1740000000000-a1b2c3",
      "timestamp": "2025-01-15T10:30:00.000Z",
      "filePath": "src/auth/tokenService.ts",
      "question": "Why are you storing the refresh token in an HttpOnly cookie rather than localStorage?",
      "answer": "localStorage is accessible via JS and vulnerable to XSS. HttpOnly cookies can't be read by scripts, so even if we have an XSS vulnerability the token can't be exfiltrated.",
      "codeSnippet": "res.cookie('refresh_token', token, { httpOnly: true, secure: true })"
    }
  ]
}
```

Commit `.codeledger/` with your code so future engineers have full context.

---

## Debugging

Open the Output panel (`View → Output`) and select **CodeLedger** from the dropdown. Every event is logged:

```
[4:30:01] Processing: Button.tsx
[4:30:01] Diff: 5 lines changed (threshold: 3).
[4:30:01] Sending to Gemini:
+ const memoized = useMemo(() => expensiveCalc(data), [data]);
- const result = expensiveCalc(data);
[4:30:02] Question: Why did you memoize this computation instead of computing it inline?
```

---

## Contributing

PRs and issues welcome. This is an early-stage project — feedback on what kinds of questions are useful (or annoying) is especially valuable.

```bash
git clone https://github.com/Yashraj19/CodeLedger.git
cd CodeLedger
npm install
npm run watch        # recompiles on file change
# Press F5 in VS Code to launch the extension

npm test             # run tests
npm run test:watch   # run tests in watch mode
npm run test:coverage  # run tests with coverage report
```
