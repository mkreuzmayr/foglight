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
import type { ResourceId } from "@foglight/core/domain";
import { useCallback, useEffect, useState } from "react";

const REMEMBERED = "foglight:last-map";

export type Address = { map: ResourceId | null; ticket: ResourceId | null };

const read = (): Address => {
  const params = new URLSearchParams(window.location.search);
  const map = params.get("map");
  const ticket = params.get("ticket");
  return {
    map: map === null || map === "" ? null : (map as ResourceId),
    ticket: ticket === null || ticket === "" ? null : (ticket as ResourceId),
  };
};

export const rememberedMap = (): ResourceId | null => {
  try {
    const stored = window.localStorage.getItem(REMEMBERED);
    return stored === null || stored === "" ? null : (stored as ResourceId);
  } catch {
    return null; // private mode, or storage disabled — not worth failing over
  }
};

export const rememberMap = (id: ResourceId): void => {
  try {
    window.localStorage.setItem(REMEMBERED, String(id));
  } catch {
    /* see above */
  }
};

export const useAddress = () => {
  const [address, setAddress] = useState<Address>(read);

  useEffect(() => {
    const onPop = () => setAddress(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const write = useCallback((next: Address, replace = false) => {
    const params = new URLSearchParams();
    if (next.map !== null) params.set("map", String(next.map));
    if (next.ticket !== null) params.set("ticket", String(next.ticket));
    const url = params.toString() === "" ? "/" : `/?${params.toString()}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setAddress(next);
  }, []);

  const selectTicket = useCallback(
    (ticket: ResourceId | null) => {
      // Selecting within a map replaces rather than pushes: clicking six cards
      // should not cost six presses of the back button.
      write({ map: address.map, ticket }, true);
    },
    [address.map, write],
  );

  const openMap = useCallback(
    (map: ResourceId) => {
      rememberMap(map);
      // Switching is a full replace — the old `?ticket` means nothing here.
      write({ map, ticket: null });
    },
    [write],
  );

  return { address, selectTicket, openMap, write };
};

/**
 * Cold start (SPEC.md §9): an explicit `?map` **always** beats the remembered
 * map — a pasted link must land where it points. Otherwise the remembered map
 * if it still exists, otherwise the only map if there is exactly one, and
 * otherwise nothing, which opens the picker.
 */
export const resolveInitialMap = (
  explicit: ResourceId | null,
  remembered: ResourceId | null,
  available: ReadonlyArray<{ id: ResourceId }>,
): ResourceId | null => {
  const exists = (id: ResourceId | null) =>
    id !== null && available.some((m) => String(m.id) === String(id));

  if (exists(explicit)) return explicit;
  if (exists(remembered)) return remembered;
  return available.length === 1 ? (available[0]?.id ?? null) : null;
};
