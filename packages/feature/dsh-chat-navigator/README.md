# dsh-chat-navigator

English · [中文版](README.zh-CN.md)

dsh Web GUI plugin: a slim conversation rail flush against the left edge of the center column — one short dash per user round — for quickly understanding the structure of a long conversation and jumping to any round.

**Best paired with [dsh-chat-autoload](../dsh-chat-autoload/README.md):** when the `chatAutoload` service is present, the rail's index always covers the complete history. Without it the rail still works — it indexes only the currently loaded window, and the rail's "…" hint marks that older history exists (it fills in as you page older messages or install dsh-chat-autoload).

## Features

- **Round markers**: one left-aligned dash per "user request + following assistant response" round (think/tool rows never get their own marker). Markers pack tightly and center vertically as a group; the rail appears only when the conversation has at least two rounds.
- **Scroll sync**: the dash of the round at the current reading position stays highlighted and follows your scrolling.
- **Fisheye hover**: the hovered dash doubles in length, its neighbors scale down by distance.
- **Preview card**: hovering or keyboard-focusing a dash floats a card with the request summary (bold primary text), the response summary (secondary text), and a shimmering "Running…" while the turn streams (same sweep animation as the chat's "Deep diving..."). User-stopped or platform-ended turns count as settled — there is no failure badge. Summaries are deterministic truncations of the existing message text: no model call, no context change, no persistence.
- **Click to jump**: clicking a dash or its card scrolls the chat to that round's user message and briefly flashes the row.
- **Session-bound**: the index rebuilds strictly from the current session's snapshot on every switch; page refresh and resumed sessions re-derive it from the same session data.

## Accessibility & themes

- Every dash is a real button with an `aria-label` (round number + title); the rail is a labelled `navigation` landmark; focus rings are visible; keyboard Enter/Space jumps, Escape closes the card.
- Works in dark and light themes via `--dsw-*` tokens, and honors `prefers-reduced-motion` (shimmer and flash animations turn static).

## Install

```sh
dsh plugin --profile <name> add @neplich/dsh-chat-navigator
# optional, for always-complete history:
dsh plugin --profile <name> add @neplich/dsh-chat-autoload
```

## Uninstall

```sh
dsh plugin --profile <name> remove @neplich/dsh-chat-navigator
```

The plugin writes no files and no settings fields, so removal leaves no residue. dsh-chat-autoload may stay installed on its own.

## Model Experience

None: the plugin never sends model requests, never modifies the session log, and never adds tools. Summaries are deterministic truncations rendered from existing session data.
