// THROWAWAY PROTOTYPE — the visual vocabulary every variant shares:
// one colour per ticket state, one glyph per ticket type. Variants disagree
// about layout, not about what "frontier" looks like.

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
  type Icon,
} from "@phosphor-icons/react";

import type { TicketState, TicketType } from "./domain";

export const stateStyle: Record<
  TicketState | "invalid",
  { label: string; text: string; border: string; bg: string; dot: string }
> = {
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
};

/** Type is carried by an icon + word, never by colour — colour is state's job. */
export const typeIcon: Record<TicketType, Icon> = {
  research: MagnifyingGlass,
  prototype: Cube,
  grilling: ChatsCircle,
  task: Wrench,
};

export const stateIcon: Record<TicketState | "invalid", Icon> = {
  closed: CheckCircle,
  frontier: ArrowRight,
  claimed: UserFocus,
  blocked: Lock,
  invalid: Warning,
};

/** Retained for variants A–C, which predate the icon set. */
export const typeGlyph: Record<TicketType, string> = {
  research: "◇",
  prototype: "▢",
  grilling: "◆",
  task: "▪",
};

export const typeLabel: Record<TicketType, string> = {
  research: "research",
  prototype: "prototype",
  grilling: "grilling",
  task: "task",
};
