/**
 * The visual vocabulary (SPEC.md §8, "Visual language").
 *
 * Two locks, and they are the whole system:
 *   - **State is colour.** One colour per ticket state, and nothing else in
 *     the UI is coloured for decoration.
 *   - **Type is an icon plus a word, never colour** — otherwise type and state
 *     compete for the same channel and neither reads.
 */

import {
  ArrowRight,
  ChatsCircle,
  CheckCircle,
  Cube,
  Lock,
  MagnifyingGlass,
  UserFocus,
  Warning,
  Wrench,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import type { TicketState, TicketType } from "@foglight/core/domain";

export const stateStyle = {
  frontier: {
    label: "frontier",
    text: "text-accent",
    border: "border-accent/70",
    bg: "bg-accent-soft/40",
    dot: "bg-accent",
  },
  claimed: {
    label: "claimed",
    text: "text-claimed",
    border: "border-claimed/50",
    bg: "bg-claimed-soft/40",
    dot: "bg-claimed",
  },
  closed: {
    label: "decided",
    text: "text-decided",
    border: "border-decided/35",
    bg: "bg-decided-soft/40",
    dot: "bg-decided",
  },
  blocked: {
    label: "blocked",
    text: "text-ink-faint",
    border: "border-hair",
    bg: "bg-panel-2",
    dot: "bg-blocked",
  },
  invalid: {
    label: "malformed",
    text: "text-invalid",
    border: "border-invalid/60",
    bg: "bg-panel-2",
    dot: "bg-invalid",
  },
} satisfies Record<
  TicketState,
  { label: string; text: string; border: string; bg: string; dot: string }
>;

/** Type is carried by an icon + word, never by colour — colour is state's job. */
export const typeIcon = {
  research: MagnifyingGlass,
  prototype: Cube,
  grilling: ChatsCircle,
  task: Wrench,
} satisfies Record<TicketType, Icon>;

export const stateIcon = {
  closed: CheckCircle,
  frontier: ArrowRight,
  claimed: UserFocus,
  blocked: Lock,
  invalid: Warning,
} satisfies Record<TicketState, Icon>;

export const typeLabel = {
  research: "research",
  prototype: "prototype",
  grilling: "grilling",
  task: "task",
} satisfies Record<TicketType, string>;
