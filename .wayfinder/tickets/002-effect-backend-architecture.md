---
title: "Effect.js backend architecture facts"
labels: [wayfinder:research]
status: open
assignee: research-agent
blocked-by: []
---

## Question

What does the Effect ecosystem (current @effect/platform and friends) offer for foglight's backend — an HTTP server serving the Vite-built UI, file watching for the local-markdown tracker, GitHub API polling, and pushing change events to the browser (SSE/websocket)? How does one Effect runtime serve both an Electron main process and a headless server? Surface the concrete modules, patterns, and any gaps the architecture decision waits on.

_Findings will land on branch `research/effect-backend`._
