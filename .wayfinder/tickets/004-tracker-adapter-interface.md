---
title: "Tracker adapter interface design"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

What is the read-only tracker adapter's interface? Pin down: the operations foglight needs (load map, list child tickets, blocking edges, claims, resolution content, change events for liveness), the normalized domain model both adapters map into (how local-markdown frontmatter and GitHub Issues labels/assignees/sub-issues each express map, ticket, type, claim, blocking), how adapters are discovered/configured per repo, and error surfaces (missing map, bad auth, malformed tickets). Grill with /grilling + /domain-modeling; record new terms in CONTEXT.md.
