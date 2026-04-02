# Codex Prompt Delivery Investigation

## Goal

This document records the investigation into why Agently could detect and open Codex in VS Code, but still failed to actually deliver prompt text into the Codex composer reliably.

The work happened in the VS Code extension at:

- `apps/vscode-extension/src/extension.ts`

The OpenAI/Codex extension that was inspected locally was:

- `~/.vscode/extensions/openai.chatgpt-26.325.31654-darwin-arm64`

## Short Version

Agently was able to:

- detect when Codex was the active target
- open the Codex sidebar
- start a new Codex thread
- add file context to that thread

But Agently could not reliably send the prompt text itself because the public commands exposed by the OpenAI/Codex extension do not provide a public "set composer text" or "submit prompt text" API for Codex.

The generic VS Code chat command path also did not work for Codex. It either targeted the wrong mode or succeeded without actually placing text into the Codex composer.

The remaining text-delivery options were:

- unsupported generic chat commands
- clipboard/paste into a webview composer
- private OpenAI extension internals
- OS-level keystroke automation

Clipboard-based delivery inside VS Code was not reliable enough. The extension was therefore changed to focus the real Codex view explicitly and, on macOS, attempt native keystroke automation after copying the prompt to the clipboard.

## Original Symptoms

Observed behavior:

- Agently received prompts from the browser bridge correctly.
- Agently opened a chat UI in VS Code.
- Logs showed success for commands such as `workbench.action.chat.open`.
- Logs also showed `workbench.action.chat.submit` completing.
- Even so, no prompt appeared in Codex.

Representative logs from the investigation:

```text
[Agently] openChatWithPrompt — mode: agent, prompt length: 225
[Agently] Trying: workbench.action.chat.open [{"query":"...","mode":"agent"}]
[Agently] Command succeeded: workbench.action.chat.open
[Agently] workbench.action.chat.submit — completed
```

Later:

```text
[Agently] openChatWithPrompt — mode: codex, prompt length: 226
[Agently] Trying: workbench.action.chat.open [{"query":"...","mode":"codex"}]
[Agently] Command succeeded: workbench.action.chat.open
[Agently] workbench.action.chat.submit — completed
```

Those logs were misleading because command success did not mean the prompt had actually landed in the Codex composer.

## Important User-Provided Context

These VS Code context values turned out to be important:

- `activeAuxiliary: "workbench.view.extension.codexSecondaryViewContainer"`
- `chatgpt.sidebarSecondaryView.active: true`
- `chatgpt.sidebarSecondaryView.visible: true`
- `viewContainer.workbench.view.extension.codexSecondaryViewContainer.enabled: true`
- `viewContainer.workbench.view.extension.codexViewContainer.enabled: false`
- `chatgpt.doesNotSupportSecondarySidebar: false`

This confirmed that Codex was not living in the primary activity bar container on this machine. It was living in the secondary sidebar.

That mattered because any focus assumptions based on the old primary sidebar model were suspect.

## What Was Changed During the Investigation

Several fixes were attempted in sequence.

### 1. Preserve editor focus while resolving file context

Agently opens a "current file" before sending the prompt so that file context can be attached. That editor open could steal focus away from the intended chat target.

This was fixed by opening those editors with focus-preserving behavior so the file could still be used for context without taking over the UI right before chat submission.

### 2. Add explicit prompt target configuration

A new Agently setting was added:

- `agently.promptTarget`

Supported values:

- `auto`
- `agent`
- `openai-codex`

This was added so the extension could be forced to target Codex instead of guessing based only on active tabs.

### 3. Improve auto-detection for Codex

Auto-detection originally depended too heavily on tabs and labels. That was not enough because Codex was active in the auxiliary view container.

Agently was updated to inspect:

- `activeAuxiliary`

This made detection much more accurate on setups where Codex lives in the secondary sidebar.

### 4. Stop relying on the generic chat path for Codex

Agently originally used `workbench.action.chat.open` for both Copilot and Codex.

That works better for the generic VS Code chat surface, but Codex is not just another generic chat participant here. It is hosted by the OpenAI extension in its own webview-based surface.

Agently was changed to use a Codex-specific path:

- open Codex sidebar
- start a new Codex chat
- add file context
- attempt to inject prompt text separately

### 5. Make Codex focus explicit

Agently now resolves whether Codex should be focused in:

- `codexSecondaryViewContainer` / `chatgpt.sidebarSecondaryView`

or

- `codexViewContainer` / `chatgpt.sidebarView`

The extension now prefers the secondary sidebar target when the related context keys show that it is enabled.

### 6. Replace VS Code paste on macOS with native keystrokes

The public VS Code `paste` and `type` command route did not reliably place content into the Codex webview composer.

Because the user is on macOS, Agently was updated to:

- copy the prompt to the clipboard
- activate VS Code
- send Command+V via `osascript`
- send Enter via `osascript`

This is currently the most practical path available without a public Codex prompt-injection API.

## What Was Verified Inside the OpenAI/Codex Extension

The OpenAI/Codex extension bundle was inspected directly to understand what commands and capabilities are actually public.

Key files inspected:

- `~/.vscode/extensions/openai.chatgpt-26.325.31654-darwin-arm64/package.json`
- `~/.vscode/extensions/openai.chatgpt-26.325.31654-darwin-arm64/out/extension.js`
- `~/.vscode/extensions/openai.chatgpt-26.325.31654-darwin-arm64/webview/assets/index-CpiKkRDN.js.map`

### Public commands confirmed

The extension contributes these relevant commands:

- `chatgpt.openSidebar`
- `chatgpt.newChat`
- `chatgpt.newCodexPanel`
- `chatgpt.addToThread`
- `chatgpt.addFileToThread`

### Codex container layout confirmed

The extension contributes two possible Codex view containers:

- `codexViewContainer` in the activity bar
- `codexSecondaryViewContainer` in the secondary sidebar

On this machine, the secondary sidebar path is the one in use.

### `chatgpt.openSidebar` behavior confirmed

Inspection of the bundled code showed that `chatgpt.openSidebar` ultimately focuses the correct Codex view based on the VS Code version:

- for newer VS Code builds, it targets `codexSecondaryViewContainer` and `chatgpt.sidebarSecondaryView`
- otherwise it targets the primary Codex sidebar container

So `chatgpt.openSidebar` itself was not the core reason prompt delivery failed.

### `chatgpt.newChat` behavior confirmed

`chatgpt.newChat` does not send prompt text.

It does two things:

- focuses Codex
- asks the webview to start a new thread

This creates a new Codex thread but does not populate the composer.

### `chatgpt.addToThread` behavior confirmed

`chatgpt.addToThread` does not send prompt text.

It reads the active text editor and selection, then attaches that file or selection to the current Codex thread as context.

It is a file-context command, not a prompt-text command.

### `chatgpt.addFileToThread` behavior confirmed

`chatgpt.addFileToThread` also only attaches file context.

It can add the file to the thread, but it cannot place user text in the composer or submit a prompt.

## Why the Generic Chat Command Path Failed

Agently tried variants of:

- `workbench.action.chat.open({ query, mode })`
- `workbench.action.chat.open({ query })`
- `workbench.action.chat.open(prompt)`

This path failed for a few reasons.

### 1. Mode mismatch

At one stage the logs showed:

```text
[Agently] openChatWithPrompt — mode: agent
```

That meant the extension was not even targeting Codex at that point. It was still selecting a generic agent mode.

This was later corrected by improving detection and configuration.

### 2. Codex is not exposed as a normal public chat mode in the way Agently needed

Even after the target changed away from `agent`, the generic command path still did not place text into Codex.

The command succeeded from VS Code's perspective, but there was no evidence that the Codex composer received the text.

### 3. Success of `workbench.action.chat.submit` was not meaningful

`workbench.action.chat.submit` completing only proved that a command was accepted. It did not prove:

- the correct surface had focus
- the Codex composer contained the desired prompt
- Codex received a turn request

That made the logs look healthier than the actual user-visible behavior.

## Why Clipboard and VS Code Paste Were Not Enough

The next implementation copied the prompt to the clipboard and then used:

- `paste`
- `type` with newline

This also failed in practice.

The likely reason is that Codex is hosted inside a webview, and command routing for generic editor paste/type does not necessarily forward into the webview composer in a way that behaves like a real user paste.

So even though:

- Codex was visible
- the clipboard contained the prompt
- the paste command was invoked

the text still did not consistently appear in the Codex composer.

## The Most Important Structural Finding

The main issue was not just focus.

The main issue was that the OpenAI/Codex extension does not expose a public command that does all of the following in one supported path:

- focus Codex
- set composer text
- submit the prompt as a user turn

Public commands exist for:

- focusing Codex
- creating a new chat
- adding file context

But no public command was found for:

- setting the composer input programmatically
- enqueueing arbitrary prompt text into Codex
- submitting that text as a new user turn

This gap is the core reason Agently could "open Codex" without being able to "send the prompt to Codex."

## Private/Internal Capabilities That Were Found

Inspection of sourcemaps and bundled code revealed that the OpenAI extension does have richer internal machinery.

### Queued follow-up system

The Codex webview includes a queued follow-up runner and state for follow-up messages. Internally, this can hold messages and eventually turn them into real Codex turns.

Important internal concepts found:

- `queued-follow-ups`
- `QueuedFollowUpState`
- `QueuedFollowUpMessage`
- `thread-queued-followups-changed`
- thread follower request/response handlers for queued follow-up state

The queued follow-up message shape appeared to include fields like:

- `id`
- `text`
- `context`
- `cwd`
- `createdAt`

This strongly suggests the OpenAI extension has an internal path to represent future user messages without typing them into the composer manually.

### Persisted atom state

The extension also has persisted atom synchronization/update plumbing between the extension host and webviews.

That means the webview and extension are already coordinating internal state in a structured way.

### Why this was not used directly

These capabilities appeared to be private implementation details, not public APIs. No stable public command or exported API was found that Agently could safely call to use them.

Using them directly would require one of:

- unsupported reverse engineering against private internals
- monkey-patching another extension's state model
- depending on unstable bundle details that could break on any OpenAI extension update

That was judged too fragile for a production integration path.

## Why Extension API Interop Was Not a Clean Answer

One possible hope was that:

- `vscode.extensions.getExtension('openai.chatgpt')?.activate()`

might return an API object exposing useful Codex methods.

Inspection of the OpenAI extension activation flow suggested that its activation function does not return a usable public API object for this purpose.

So even though the extension has an internal provider object with rich methods, those methods are not available through a supported public extension API.

## Current Conclusion

The investigation led to these conclusions:

1. Agently can detect and focus Codex correctly.
2. Agently can start a new Codex thread correctly.
3. Agently can add file context to Codex correctly.
4. The failure point is prompt text injection and submission.
5. No supported public Codex command was found to set and submit arbitrary prompt text.
6. Generic VS Code chat commands are not sufficient for Codex here.
7. Clipboard-plus-VS-Code-paste is unreliable for the Codex webview composer.
8. The only practical remaining non-private option on macOS is native keystroke automation after focusing the correct Codex surface.

## Current Implementation Direction

The extension now does the following for Codex:

1. Resolve the actual Codex target view.
2. Focus that view explicitly.
3. Start a new Codex chat.
4. Add file context if available.
5. Copy the prompt to the clipboard.
6. On macOS, use native keystrokes to paste and submit.

This is not as clean as a first-class API, but it is the only path found so far that has a realistic chance of behaving like an actual user interaction in the Codex webview.

## Remaining Risks

Even with the current workaround, there are still risks:

- macOS accessibility permissions may block keystroke automation
- timing between focus and paste may still matter
- future OpenAI extension updates could alter Codex webview behavior
- if Codex changes how its composer handles focus, keystroke automation may need adjustment

## Recommended Long-Term Fix

The best long-term fix would be a supported Codex API from the OpenAI extension or from VS Code itself.

Ideally, one of these would exist:

- a public command like "send prompt to Codex"
- a public command like "set Codex composer text"
- a public command like "start Codex turn with prompt and attachments"
- a public extension API exposed by `openai.chatgpt`

Until a supported path exists, any Codex prompt-submission integration will remain somewhat workaround-based.

## Suggested Next Investigation If Problems Continue

If prompt delivery still fails even with macOS native keystrokes, the next things to verify are:

1. Whether macOS accessibility permissions are preventing `System Events` from sending keystrokes to VS Code.
2. Whether the Codex composer is actually focused after the new thread is created.
3. Whether an extra Tab or click-equivalent step is needed before paste.
4. Whether a Codex-specific internal message path can be used safely enough despite being private.

## Files Touched During This Investigation

Main Agently file:

- `apps/vscode-extension/src/extension.ts`

Related config file:

- `apps/vscode-extension/package.json`

This report was added at:

- `apps/vscode-extension/CODEX_PROMPT_FINDINGS.md`
