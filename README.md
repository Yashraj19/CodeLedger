# CodeLedger

A VS Code extension that captures the *why* behind your code decisions — not just the what.

Engineers forget why they made certain choices. New teammates inherit code with no context. CodeLedger fixes this by watching your code as you write it, asking you smart questions about the decisions you make, and storing your answers alongside the code — so the reasoning never gets lost.

---

## How it works

1. You save a file
2. CodeLedger computes what changed and sends the diff to Gemini
3. If Gemini detects a meaningful decision (algorithm choice, workaround, architectural trade-off), it generates a specific question
4. A panel opens beside your editor asking you to explain your reasoning
5. Your answer is saved to a `.codeledger/` folder in your workspace
6. Commit that folder with your code — the context travels with the codebase

---

## Features

- **AI-powered questions** — Gemini reads your actual diff and asks about *your specific change*, not a generic prompt
- **Non-intrusive** — configurable cooldown between questions so it doesn't interrupt your flow
- **Plain file storage** — decisions are stored as JSON in `.codeledger/`, readable without the extension
- **Explorer sidebar** — browse all logged decisions grouped by file, click any to read it
- **Team-friendly** — commit `.codeledger/` to your repo so the whole team benefits

---

## Getting started

### 1. Prerequisites

- [VS Code](https://code.visualstudio.com/) 1.85 or later
- A free [Google Gemini API key](https://ai.google.dev/)
- [Node.js](https://nodejs.org/) 18+ (for building from source)

### 2. Run from source

```bash
git clone https://github.com/Yashraj19/CodeLedger.git
cd CodeLedger
npm install
npm run compile
```

Then open the folder in VS Code and press **F5** — this launches an Extension Development Host with CodeLedger loaded.

### 3. Set your API key

In the Extension Development Host window, open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

```
CodeLedger: Set Gemini API Key
```

Paste your Gemini API key. It's stored in your global VS Code settings (never committed to any repo).

### 4. Open a project and start coding

Open any folder with code files. Make a non-trivial change to a file and save it. If Gemini detects a meaningful decision, a panel will appear asking you to explain your reasoning.

---

## Configuration

All settings are under `codeledger.*` in VS Code settings:

| Setting | Default | Description |
|---|---|---|
| `codeledger.geminiApiKey` | `""` | Your Gemini API key |
| `codeledger.minLinesChanged` | `3` | Minimum lines changed before a question is considered |
| `codeledger.cooldownMinutes` | `5` | Minutes to wait between questions |
| `codeledger.storageFolder` | `.codeledger` | Folder name for decision storage |

---

## Decision storage format

Decisions are stored as JSON files in `.codeledger/` at your workspace root, one file per source file:

```json
{
  "file": "src/auth/tokenService.ts",
  "decisions": [
    {
      "id": "1740000000000-a1b2c3",
      "timestamp": "2025-01-15T10:30:00.000Z",
      "filePath": "src/auth/tokenService.ts",
      "question": "Why are you storing the refresh token in an HttpOnly cookie rather than localStorage?",
      "answer": "localStorage is accessible via JS and vulnerable to XSS. HttpOnly cookies can't be read by scripts so even if we have an XSS vulnerability the token can't be exfiltrated.",
      "codeSnippet": "res.cookie('refresh_token', token, { httpOnly: true, secure: true })"
    }
  ]
}
```

Commit the `.codeledger/` folder. New engineers — or future you — will have full context for every non-obvious decision.

---

## Commands

| Command | Description |
|---|---|
| `CodeLedger: Set Gemini API Key` | Set or update your Gemini API key |
| `CodeLedger: Show Decisions for Current File` | Focus the sidebar on the current file's decisions |
| `CodeLedger: Refresh` | Refresh the decisions sidebar |

---

## Why Gemini?

Gemini 2.0 Flash is fast, cheap, and accurate enough to distinguish a meaningful architectural decision from a trivial formatting change. It reads the actual diff — not a description of it — so questions are specific to what you actually wrote.

---

## Contributing

PRs and issues welcome. This is an early-stage project — feedback on what kinds of questions are useful (or annoying) is especially valuable.

```bash
git clone https://github.com/Yashraj19/CodeLedger.git
cd CodeLedger
npm install
npm run watch   # recompiles on file change
# Press F5 in VS Code to launch the extension
```
