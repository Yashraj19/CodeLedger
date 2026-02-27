import * as vscode from 'vscode';
import * as path from 'path';
import { DecisionStorage, Decision } from './decisionStorage';

type TreeNode = FileNode | DecisionNode;

class FileNode extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly decisions: Decision[]
  ) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.Collapsed);
    this.tooltip = filePath;
    this.description = `${decisions.length} decision${decisions.length !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.contextValue = 'codeledger-file';
  }
}

class DecisionNode extends vscode.TreeItem {
  constructor(public readonly decision: Decision) {
    // Truncate long questions for the tree label
    const label =
      decision.question.length > 60
        ? decision.question.slice(0, 57) + '...'
        : decision.question;

    super(label, vscode.TreeItemCollapsibleState.None);

    this.tooltip = `Q: ${decision.question}\n\nA: ${decision.answer}`;
    this.description = new Date(decision.timestamp).toLocaleDateString();
    this.iconPath = new vscode.ThemeIcon('comment-discussion');
    this.contextValue = 'codeledger-decision';
    this.command = {
      command: 'codeledger.viewDecision',
      title: 'View Decision',
      arguments: [decision],
    };
  }
}

export class DecisionsProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | null
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private storage: DecisionStorage) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      const all = this.storage.getAllDecisions();
      if (all.length === 0) {
        return [];
      }
      return all.map(({ filePath, decisions }) => new FileNode(filePath, decisions));
    }

    if (element instanceof FileNode) {
      return element.decisions
        .slice()
        .reverse() // newest first
        .map(d => new DecisionNode(d));
    }

    return [];
  }
}
