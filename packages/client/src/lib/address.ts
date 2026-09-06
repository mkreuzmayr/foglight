/**
 * Addressing (SPEC.md §9).
 *
 * **`/?map=<id>&ticket=<id>`** — query params, not path routes, because map
 * ids contain `#` and `/`; this also matches `GET /api/events?map=<id>`
 * exactly, so there is one way to name a map on this whole system.
 *
 * **No router library and no server catch-all**: two search params read into
 * state is the entirety of the requirement. The `ticket` param selects a rail
 * accordion, because links get pasted — especially from headless, where the
 * point is to send someone a URL.
 */
import { makeId } from "@foglight/core/domain";
import type { ResourceId } from "@foglight/core/domain";
import { Schema } from "effect";
import { useEffect, useState } from "react";

const REMEMBERED = "foglight:last-map";

export type Address = { map: ResourceId | null; ticket: ResourceId | null };

/** Displayable memory of a map whose project has detached. */
export type RememberedInfo = { title: string; projectName: string };

type StoredRemembered = { id: ResourceId } & RememberedInfo;

const read = (): Address => {
  const params = new URLSearchParams(window.location.search);
  const map = params.get("map");
  const ticket = params.get("ticket");

  return {
    map: map === null || map === "" ? null : makeId(map),
    ticket: ticket === null || ticket === "" ? null : makeId(ticket),
  };
};

const readRemembered = (): StoredRemembered | null => {
  try {
    const raw = window.localStorage.getItem(REMEMBERED);
    if (raw === null || raw === "") {
      return null;
    }

    if (raw.startsWith("{")) {
      const parsed = Schema.decodeUnknownSync(
        Schema.parseJson(
          Schema.Struct({
            id: Schema.String,
            title: Schema.optional(Schema.Unknown),
            projectName: Schema.optional(Schema.Unknown),
          }),
        ),
      )(raw);

      if (typeof parsed.id === "string" && parsed.id !== "") {
        return {
          id: makeId(parsed.id),
          title: typeof parsed.title === "string" ? parsed.title : "",
          projectName: typeof parsed.projectName === "string" ? parsed.projectName : "",
        };
      }

      return null;
    }

    return { id: makeId(raw), title: "", projectName: "" };
  } catch {
    return null; // private mode, or storage disabled — not worth failing over
  }
};

export const rememberedMap = (): ResourceId | null => readRemembered()?.id ?? null;

export const rememberedInfo = (): RememberedInfo | null => {
  const stored = readRemembered();
  if (stored === null || stored.title === "") {
    return null;
  }

  return { title: stored.title, projectName: stored.projectName };
};

export const rememberMap = (id: ResourceId, info?: RememberedInfo): void => {
  try {
    const previous = readRemembered();
    const same = previous?.id === id;
    const payload: StoredRemembered = {
      id,
      title: rememberedText(info?.title, same ? previous.title : ""),
      projectName: rememberedText(info?.projectName, same ? previous.projectName : ""),
    };

    window.localStorage.setItem(REMEMBERED, JSON.stringify(payload));
  } catch {
    /* see above */
  }
};

export const useAddress = () => {
  const [address, setAddress] = useState<Address>(read);

  // oxlint-disable-next-line mkrz/no-restricted-react-hooks -- Subscribe to browser history navigation and remove the popstate listener on unmount.
  useEffect(() => {
    const onPop = () => setAddress(read());
    window.addEventListener("popstate", onPop);

    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const write = (next: Address, replace = false) => {
    const params = new URLSearchParams();
    if (next.map !== null) {
      params.set("map", String(next.map));
    }

    if (next.ticket !== null) {
      params.set("ticket", String(next.ticket));
    }

    const url = params.toString() === "" ? "/" : `/?${params.toString()}`;
    if (replace) {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
    }

    setAddress(next);
  };

  const selectTicket = (ticket: ResourceId | null) => {
    // Selecting within a map replaces rather than pushes: clicking six cards
    // should not cost six presses of the back button.
    write({ map: address.map, ticket }, true);
  };

  const openMap = (map: ResourceId, info?: RememberedInfo) => {
    rememberMap(map, info);
    // Switching is a full replace — the old `?ticket` means nothing here.
    write({ map, ticket: null });
  };

  return { address, selectTicket, openMap, write };
};

/**
 * Cold start (SPEC.md §9, ticket 003): an explicit `?map` **always** beats
 * the remembered map — a pasted link must land where it points. Otherwise the
 * remembered map if it is still attached. A remembered id whose project has
 * detached is *kept* and waited for — never replaced by a different project's
 * map. Only when nothing is remembered does a sole reachable map open itself.
 */
export const resolveInitialMap = (
  explicit: ResourceId | null,
  remembered: ResourceId | null,
  available: readonly { id: ResourceId }[],
): ResourceId | null => {
  const exists = (id: ResourceId | null) =>
    id !== null && available.some((m) => String(m.id) === String(id));

  if (exists(explicit)) {
    return explicit;
  }

  if (exists(remembered)) {
    return remembered;
  }

  // A remembered id whose project isn't attached: wait for re-attach.
  // Never silently open a different project's map (ticket 003).
  if (remembered !== null) {
    return null;
  }

  return available.length === 1 ? (available[0]?.id ?? null) : null;
};

const rememberedText = (current: string | undefined, previous: string) =>
  current === undefined || current === "" ? previous : current;
