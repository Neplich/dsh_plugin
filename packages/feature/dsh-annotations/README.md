# @neplich/dsh-annotations

[中文版](README.zh-CN.md) · English

A dsh Web GUI plugin: select text inside a historical assistant reply and attach it to the current composer as a pending annotation. Annotations ride along with your next message as attached context — you still type the actual instruction yourself.

## Features

- **Select to annotate**: drag over text in a settled assistant message; a floating "Add to session" pill appears near the selection (above it, flipped below when there is no room).
- **Persistent highlight**: the selected text stays highlighted in the original message; the highlight survives React re-renders and is removed when the annotation is deleted or sent.
- **Composer chip**: the input bar shows an "N annotations" pill (standard Pill geometry, annotation blue). Hover, click, or keyboard-focus the pill to open the detail popover; the in-pill × clears all annotations.
- **Detail popover**: one row per annotation — number, the selected text (line breaks preserved, long content scrolls), and a per-item delete ×. Hovering a row strengthens the highlight in the original message; clicking it scrolls to the original text (expanding any collapsed ancestor first).
- **Send together**: when you send a message, each annotation's text enters the message content verbatim (blank-line separated) and becomes part of the conversation; a successful send clears the annotations, a failed one keeps them.
- **Guarded selection**: only a single settled `assistant-step` message can be annotated — no streaming content, no reasoning (Think) rows, no tool cards or other chrome, no overlap with existing annotations.
- **Bilingual UI**: all copy follows the dsh UI language (zh/en), including the count expressions.

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-annotations
```

Boot the profile with `dsh --profile <name>` and open the Web GUI.

## Configuration

None — the plugin has no configurable options.

## Model Experience

- Annotations are **user message content**: when sent, each annotation's text is prepended to your message (blank-line separated), so the model sees exactly what you quoted plus your instruction. Nothing model-visible depends on the UI language.
- Annotations alone never trigger a model request: the send button stays disabled while the draft is empty.

## Known Limitations and Deferred Work

- **Runtime-only state**: annotations live in the browser session only — a page refresh or plugin reload clears them. Persisting them (and re-attaching highlights from the log) is deferred.
- **Shipped-DOM coupling**: the selection anchor relies on the shipped chat flow's `data-chat-flow-kind` / `data-chat-anchor-key` row markers and `[data-streaming]` / `[data-variant="think"]` markers; a harness markup change may require an update here.
- **Prompt wrapper**: sending rides one scoped `session.prompt` wrapper installed while annotations exist for a session (the harness offers no send-interception extension point for attaching extra context); the wrapper is removed on plugin unload.
- **Marks are presentation**: highlights are DOM-only (never part of the session log); a full re-render that restructures a message beyond the stored child-index paths leaves that annotation unhighlighted (still listed in the popover).
