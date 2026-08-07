---
title: "Map picker and multi-map UX"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

Graduated from fog now that the map view is settled ([Map graph UI prototype](005-map-graph-ui-prototype.md)): the cockpit shows exactly one map, and this repo is itself a multi-tracker case, so how does a person get to a *different* map?

Pin down: where the picker lives given the settled layout (a rail header control, a separate route, a command-palette style overlay); what a [Map descriptor](../../CONTEXT.md) shows at rest (title, destination, decided/total, which tracker) and how maps are ordered; how the union across trackers is presented when local-markdown and GitHub Issues are both live and may describe the *same* effort; what foglight opens on launch with no argument (last map, only map, or the picker); whether a map is addressable by URL, which headless mode makes load-bearing since people will share links.

Grill with /grilling + /domain-modeling. The prototype branch `prototype/map-graph-ui` is available to make any of this concrete rather than argued.
