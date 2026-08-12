/**
 * The prose half of the split (SPEC.md §6).
 *
 * A snapshot is what gets *drawn*; bodies are what gets *read*. They move
 * independently, so they are fetched independently — one endpoint per
 * resource, no bulk endpoint and no batch POST.
 *
 * **All bodies prefetch after first paint** on a throttled, low-priority,
 * cancellable queue: opening a ticket in the rail should feel like expanding
 * something already there, not like starting a request. Thereafter only
 * changed hashes refetch, because the cache key contains the hash.
 */
import type { MapSnapshot, ResourceId } from "@foglight/core/domain";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { mapBodyQuery, ticketBodyQuery } from "./api.js";

/** Small enough that the queue never competes with the first interaction. */
const CONCURRENCY = 2;
/** A breath between batches, so the main thread stays the user's. */
const BREATH_MS = 60;

const idle = (run: () => void): (() => void) => {
  const anyWindow = window as Window & {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof anyWindow.requestIdleCallback === "function") {
    const handle = anyWindow.requestIdleCallback(run);
    return () => anyWindow.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(run, 200);
  return () => window.clearTimeout(handle);
};

/**
 * Warms every body for the open map. Cancellable in two senses that both
 * matter: the idle callback is cancelled on unmount, and the `cancelled` flag
 * stops the queue mid-flight when the map switches — a prefetch for a map
 * nobody is looking at any more is pure waste.
 */
export const usePrefetchBodies = (snapshot: MapSnapshot | null): void => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (snapshot === null) return;
    let cancelled = false;

    const cancelIdle = idle(() => {
      void (async () => {
        const jobs: Array<() => Promise<unknown>> = [
          () => queryClient.prefetchQuery(mapBodyQuery(snapshot.id, snapshot.bodyHash)),
          ...snapshot.tickets.map(
            (ticket) => () =>
              queryClient.prefetchQuery(ticketBodyQuery(snapshot.id, ticket.id, ticket.bodyHash)),
          ),
        ];

        // `cancelled` is set by the cleanup closure returned below; the loop
        // awaits between batches, so it observes the flag mid-flight.
        // oxlint-disable-next-line no-unmodified-loop-condition
        for (let i = 0; i < jobs.length && !cancelled; i += CONCURRENCY) {
          await Promise.allSettled(jobs.slice(i, i + CONCURRENCY).map((job) => job()));
          await new Promise((resolve) => setTimeout(resolve, BREATH_MS));
        }
      })();
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [snapshot, queryClient]);
};

/**
 * One ticket's prose. A failed fetch — or a ticket that vanished between the
 * snapshot and the request — renders an inline error with retry *inside the
 * accordion*; the card stays on the graph, because the structure is still
 * true even when the prose could not be read.
 */
export const useTicketBody = (mapId: ResourceId, ticketId: ResourceId, hash: string) =>
  useQuery(ticketBodyQuery(mapId, ticketId, hash));

export const useMapBody = (mapId: ResourceId, hash: string) => useQuery(mapBodyQuery(mapId, hash));

export const invalidateBodies = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries({ queryKey: ["body"] });
};
