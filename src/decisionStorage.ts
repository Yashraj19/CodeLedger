import * as path from 'path';
import * as fs from 'fs';

export interface Decision {
  id: string;
  timestamp: string;
  filePath: string;
  codeSnippet: string;
  question: string;
  answer: string;
}

interface DecisionFile {
  file: string;
  decisions: Decision[];
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export class DecisionStorage {
  private storageFolder: string;

  constructor(
    private workspaceRoot: string,
    folderName: string
  ) {
    this.storageFolder = path.join(workspaceRoot, folderName);
  }

  private ensureStorageFolder(): void {
    if (!fs.existsSync(this.storageFolder)) {
      try {
        fs.mkdirSync(this.storageFolder, { recursive: true });
        fs.writeFileSync(
          path.join(this.storageFolder, 'README.md'),
          [
            '# CodeLedger — Decision Log',
            '',
            'This folder contains decision logs captured by the [CodeLedger](https://github.com/Yashraj19/CodeLedger) VS Code extension.',
            '',
            '**Commit this folder with your code** so the reasoning behind technical decisions travels with the codebase.',
            '',
            'Each `.json` file corresponds to a source file and contains questions and answers logged during development.',
          ].join('\n')
        );
      } catch (err: any) {
        throw new Error(`Failed to create .codeledger folder: ${err.message}`);
      }
    }
  }

  private getStoragePath(filePath: string): string {
    const relative = path.relative(this.workspaceRoot, filePath);
    const safeName = relative
      .replace(/[/\\]/g, '__')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.storageFolder, `${safeName}.json`);
  }

  saveDecision(
    filePath: string,
    question: string,
    answer: string,
    codeSnippet: string
  ): Decision {
    this.ensureStorageFolder();

    const storagePath = this.getStoragePath(filePath);
    const fallback: DecisionFile = {
      file: path.relative(this.workspaceRoot, filePath),
      decisions: [],
    };
    const decisionFile = fs.existsSync(storagePath)
      ? safeReadJson<DecisionFile>(storagePath, fallback)
      : fallback;

    const decision: Decision = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      filePath: path.relative(this.workspaceRoot, filePath),
      codeSnippet,
      question,
      answer,
    };

    decisionFile.decisions.push(decision);

    try {
      fs.writeFileSync(storagePath, JSON.stringify(decisionFile, null, 2));
    } catch (err: any) {
      throw new Error(`Failed to save decision: ${err.message}`);
    }

    return decision;
  }

  getDecisions(filePath: string): Decision[] {
    const storagePath = this.getStoragePath(filePath);
    if (!fs.existsSync(storagePath)) {
      return [];
    }
    const fallback: DecisionFile = { file: '', decisions: [] };
    return safeReadJson<DecisionFile>(storagePath, fallback).decisions;
  }

  getAllDecisions(): { filePath: string; decisions: Decision[] }[] {
    if (!fs.existsSync(this.storageFolder)) {
      return [];
    }

    return fs
      .readdirSync(this.storageFolder)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const fallback: DecisionFile = { file: f, decisions: [] };
        const content = safeReadJson<DecisionFile>(
          path.join(this.storageFolder, f),
          fallback
        );
        return { filePath: content.file, decisions: content.decisions };
      })
      .filter(entry => entry.decisions.length > 0);
  }
}
