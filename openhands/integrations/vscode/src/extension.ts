import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { createOrShowWebview } from "./webview";
import { GitExtension } from "./api/git";

// Create output channel for debug logging
const outputChannel = vscode.window.createOutputChannel("OpenHands Debug");

async function getGitStatus() {
  try {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension) {
      outputChannel.appendLine('Git extension not found.');
      return null;
    }
    await extension.activate();
    const api = extension.exports.getAPI(1);
    if (api.repositories.length === 0) {
      outputChannel.appendLine('No Git repository found.');
      return null;
    }
    const repo = api.repositories[0];
    const head = repo.state.HEAD;
    const branch = head ? head.name : 'detached';
    const changes = repo.state.workingTreeChanges;
    return {
      branch,
      changes: changes.map(change => ({
        uri: change.uri.toString(),
        status: change.status,
      })),
    };
  } catch (error) {
    outputChannel.appendLine(`Error getting Git status: ${error}`);
    return null;
  }
}

async function getDependencyFiles() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return null;
  }
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const dependencyFiles: { [key: string]: string } = {};
  const dependencyFileNames = [
    'package.json',
    'requirements.txt',
    'pom.xml',
    'build.gradle',
    'Gemfile',
  ];
  for (const fileName of dependencyFileNames) {
    const filePath = path.join(workspaceRoot, fileName);
    if (fs.existsSync(filePath)) {
      dependencyFiles[fileName] = fs.readFileSync(filePath, 'utf-8');
    }
  }
  return dependencyFiles;
}

async function getWorkspaceContext() {
  const openFiles = vscode.workspace.textDocuments.map(doc => doc.fileName);
  const gitStatus = await getGitStatus();
  const dependencies = await getDependencyFiles();
  return {
    openFiles,
    gitStatus,
    dependencies,
  };
}

/**
 * Creates a contextual task message for file content
 * @param filePath The file path (or "Untitled" for unsaved files)
 * @param content The file content
 * @param languageId The programming language ID
 * @returns string A descriptive task message
 */
function createFileContextMessage(
  filePath: string,
  content: string,
  languageId?: string,
): string {
  const fileName =
    filePath === "Untitled" ? "an untitled file" : `file ${filePath}`;
  const langInfo = languageId ? ` (${languageId})` : "";

  return `User opened ${fileName}${langInfo}. Here's the content:

\`\`\`${languageId || ""}
${content}
\`\`\`

Please ask the user what they want to do with this file.`;
}

/**
 * Creates a contextual task message for selected text
 * @param filePath The file path (or "Untitled" for unsaved files)
 * @param content The selected content
 * @param startLine 1-based start line number
 * @param endLine 1-based end line number
 * @param languageId The programming language ID
 * @returns string A descriptive task message
 */
function createSelectionContextMessage(
  filePath: string,
  content: string,
  startLine: number,
  endLine: number,
  languageId?: string,
): string {
  const fileName =
    filePath === "Untitled" ? "an untitled file" : `file ${filePath}`;
  const langInfo = languageId ? ` (${languageId})` : "";
  const lineInfo =
    startLine === endLine
      ? `line ${startLine}`
      : `lines ${startLine}-${endLine}`;

  return `User selected ${lineInfo} in ${fileName}${langInfo}. Here's the selected content:

\`\`\`${languageId || ""}
${content}
\`\`\`

Please ask the user what they want to do with this selection.`;
}

export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('openhands');
  context.subscriptions.push(diagnosticCollection);

  // Command: Start New Conversation
  const startConversationDisposable = vscode.commands.registerCommand(
    "openhands.startConversation",
    async () => {
      const panel = createOrShowWebview(context);
      panel.webview.onDidReceiveMessage(message => {
        handleWebviewMessage(message, diagnosticCollection);
      });
      panel.webview.postMessage({ command: "workspaceContext", context: await getWorkspaceContext() });
    },
  );
  context.subscriptions.push(startConversationDisposable);

function handleWebviewMessage(message: any, diagnosticCollection: vscode.DiagnosticCollection) {
  switch (message.command) {
    case 'suggestions':
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const suggestions = message.suggestions;
      const diagnostics: vscode.Diagnostic[] = [];
      for (const suggestion of suggestions) {
        const range = new vscode.Range(
          suggestion.range.startLine,
          suggestion.range.startChar,
          suggestion.range.endLine,
          suggestion.range.endChar,
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          suggestion.message,
          suggestion.severity === 'error' ? vscode.DiagnosticSeverity.Error :
          suggestion.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
          suggestion.severity === 'info' ? vscode.DiagnosticSeverity.Information :
          vscode.DiagnosticSeverity.Hint
        );
        diagnostics.push(diagnostic);
      }
      diagnosticCollection.set(editor.document.uri, diagnostics);
      break;
  }
}

  // Command: Start Conversation with Active File Content
  const startWithFileContextDisposable = vscode.commands.registerCommand(
    "openhands.startConversationWithFileContext",
    async () => {
      const editor = vscode.window.activeTextEditor;
      const panel = createOrShowWebview(context);
      panel.webview.onDidReceiveMessage(message => {
        handleWebviewMessage(message, diagnosticCollection);
      });

      if (!editor) {
        panel.webview.postMessage({ command: "workspaceContext", context: await getWorkspaceContext() });
        return;
      }

      panel.webview.postMessage({ command: "workspaceContext", context: await getWorkspaceContext() });

      if (editor.document.isUntitled) {
        const fileContent = editor.document.getText();
        if (!fileContent.trim()) {
          return;
        }
        const contextualTask = createFileContextMessage(
          "Untitled",
          fileContent,
          editor.document.languageId,
        );
        panel.webview.postMessage({ command: "context", context: contextualTask });
      } else {
        const filePath = editor.document.uri.fsPath;
        panel.webview.postMessage({ command: "file", file: filePath });
      }
    },
  );
  context.subscriptions.push(startWithFileContextDisposable);

  // Command: Start Conversation with Selected Text
  const startWithSelectionContextDisposable = vscode.commands.registerCommand(
    "openhands.startConversationWithSelectionContext",
    async () => {
      const editor = vscode.window.activeTextEditor;
      const panel = createOrShowWebview(context);
      panel.webview.onDidReceiveMessage(message => {
        handleWebviewMessage(message, diagnosticCollection);
      });

      if (!editor || editor.selection.isEmpty) {
        panel.webview.postMessage({ command: "workspaceContext", context: await getWorkspaceContext() });
        return;
      }

      panel.webview.postMessage({ command: "workspaceContext", context: await getWorkspaceContext() });
      const selectedText = editor.document.getText(editor.selection);
      const startLine = editor.selection.start.line + 1;
      const endLine = editor.selection.end.line + 1;
      const filePath = editor.document.isUntitled
        ? "Untitled"
        : editor.document.uri.fsPath;

      const contextualTask = createSelectionContextMessage(
        filePath,
        selectedText,
        startLine,
        endLine,
        editor.document.languageId,
      );
      panel.webview.postMessage({ command: "context", context: contextualTask });
    },
  );
  context.subscriptions.push(startWithSelectionContextDisposable);

  const proactiveAssistDisposable = vscode.commands.registerCommand(
    "openhands.proactiveAssist",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const panel = createOrShowWebview(context);
      panel.webview.postMessage({ command: "proactiveAssist", code: editor.document.getText() });
    },
  );
  context.subscriptions.push(proactiveAssistDisposable);
}

export function deactivate() {
  // Clean up resources if needed, though for this simple extension,
  // VS Code handles terminal disposal.
}
