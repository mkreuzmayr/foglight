# Local-markdown tracker

This repo's issue tracker is plain markdown files under `.wayfinder/`.

## Wayfinding operations

- **The map** is `.wayfinder/map.md` (frontmatter `labels: [wayfinder:map]`).
- **Tickets** are files in `.wayfinder/tickets/NNN-<slug>.md`. The filename's `NNN` is the ticket id; the frontmatter `title` is its name. Refer to tickets by title, linking the file.
- **Ticket frontmatter**: `title`, `labels` (one `wayfinder:<type>`), `status` (`open` | `closed`), `assignee` (empty = unclaimed), `blocked-by` (list of ticket ids).
- **Claiming**: set `assignee` to your name before any work.
- **Blocking**: the `blocked-by` list is the native dependency relationship. A ticket is unblocked when every id in `blocked-by` points at a `status: closed` ticket.
- **Frontier query**: open tickets with empty `assignee` whose `blocked-by` ids are all closed.
- **Resolution**: append a `## Resolution` section to the ticket body, set `status: closed`, and add the one-line gist to the map's Decisions so far.
