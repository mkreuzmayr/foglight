---
title: "Headless mode and Tailscale design"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: [1]
---

## Question

How does headless mode work on a VPS/VM? Pin down: what `npx foglight --headless` (flag name TBD) serves and to whom, what "Tailscale support" concretely means here (bind to tailnet interface, tsnet-style embedding, or just docs for serving over an existing tailnet — how does t3code do it?), the auth story for a browser hitting a remote foglight, and how headless and Electron modes share one codebase given the packaging facts from the Electron research.
