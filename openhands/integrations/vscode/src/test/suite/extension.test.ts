import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { resetCurrentPanel } from "../../webview";

suite("Extension Test Suite", () => {
  let createWebviewPanelStub: sinon.SinonStub;
  let postMessageSpy: sinon.SinonSpy;
  let showInformationMessageStub: sinon.SinonStub;

  setup(() => {
    resetCurrentPanel();
    postMessageSpy = sinon.spy();
    createWebviewPanelStub = sinon.stub(vscode.window, "createWebviewPanel").returns({
      webview: {
        onDidReceiveMessage: () => {},
        postMessage: postMessageSpy,
        asWebviewUri: (uri: vscode.Uri) => uri,
        html: "",
      },
      onDidDispose: () => {},
      reveal: () => {},
    } as any);
    showInformationMessageStub = sinon.stub(vscode.window, "showInformationMessage");
  });

  teardown(() => {
    sinon.restore();
  });

  test("Extension should be present and activate", async () => {
    const extension = vscode.extensions.getExtension(
      "openhands.openhands-vscode",
    );
    assert.ok(
      extension,
      "Extension should be found (check publisher.name in package.json)",
    );
    if (!extension.isActive) {
      await extension.activate();
    }
    assert.ok(extension.isActive, "Extension should be active");
  });

  test("Commands should be registered", async () => {
    const extension = vscode.extensions.getExtension(
      "openhands.openhands-vscode",
    );
    if (extension && !extension.isActive) {
      await extension.activate();
    }
    const commands = await vscode.commands.getCommands(true);
    const expectedCommands = [
      "openhands.startConversation",
      "openhands.startConversationWithFileContext",
      "openhands.startConversationWithSelectionContext",
      "openhands.proactiveAssist",
    ];
    for (const cmd of expectedCommands) {
      assert.ok(
        commands.includes(cmd),
        `Command '${cmd}' should be registered`,
      );
    }
  });

  test("openhands.startConversation should create a webview panel", async () => {
    await vscode.commands.executeCommand("openhands.startConversation");
    assert.ok(createWebviewPanelStub.calledOnce, "createWebviewPanel should be called");
  });

  test("openhands.startConversation should post workspace context to the webview", async () => {
    await vscode.commands.executeCommand("openhands.startConversation");
    assert.ok(postMessageSpy.calledOnce, "postMessage should be called");
    const message = postMessageSpy.firstCall.args[0];
    assert.strictEqual(message.command, "workspaceContext", "The command should be workspaceContext");
    assert.ok(message.context.openFiles, "The context should have openFiles");
  });
});
