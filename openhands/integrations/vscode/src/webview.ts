import * as vscode from "vscode";

const VIEW_TYPE = "openhands.webview";

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function createOrShowWebview(context: vscode.ExtensionContext): vscode.WebviewPanel {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined;

  // If we already have a panel, show it.
  if (currentPanel) {
    currentPanel.reveal(column);
    return currentPanel;
  }

  // Otherwise, create a new panel.
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    "OpenHands",
    column || vscode.ViewColumn.One,
    {
      // Enable javascript in the webview
      enableScripts: true,

      // And restrict the webview to only loading content from our extension's `media` directory.
      // localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    },
  );

  currentPanel = panel;

  // Set the webview's initial html content
  panel.webview.html = getWebviewContent();

  // Listen for when the panel is disposed
  // This happens when the user closes the panel or when the panel is closed programatically
  panel.onDidDispose(() => (currentPanel = undefined));

  return panel;
}

export function resetCurrentPanel() {
  currentPanel = undefined;
}

function getWebviewContent() {
  // The frontend is served on localhost:3001
  const frontendUrl = "http://localhost:3001";

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OpenHands</title>
        <style>
            body, html, iframe {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
            }
        </style>
    </head>
    <body>
        <iframe src="${frontendUrl}" frameborder="0" style="width: 100%; height: 100%;"></iframe>
    </body>
    </html>`;
}
