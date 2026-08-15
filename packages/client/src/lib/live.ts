/**
 * The SSE feed (SPEC.md §6, "Transport").
 *
 * SSE rather than WebSocket because the product is one-directional, because
 * `EventSource`'s auto-reconnect is free, and because it proxies cleanly
 * through `tailscale serve` — which is the path headless actually gets used
 * over. The feed stays a plain `EventSource`: the `effect-query` bridge covers
 * request/response only, and `streamedQuery` is deliberately unused (it is
 * experimental, and a query stays `fetching` until the stream *ends*, which
 * for a perpetual feed is never).
 */
import type { MapDescriptor, MapSnapshot, Project, ResourceId } from "@foglight/core/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { keys } from "./api.js";

/** Rendered in the rail header — never as a modal or an overlay (SPEC.md §8). */
export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

export type Live = {
  readonly connection: ConnectionState;
  readonly snapshot: MapSnapshot | null;
  readonly maps: ReadonlyArray<MapDescriptor> | null;
  readonly projects: ReadonlyArray<Project> | null;
  /** true once a snapshot has been superseded by a failed connection */
  readonly stale: boolean;
  readonly retryNow: () => void;
};

/** Give up calling it "reconnecting" and call it offline after this many tries. */
const OFFLINE_AFTER = 3;

export const useLive = (mapId: ResourceId | null): Live => {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null);
  const [maps, setMaps] = useState<ReadonlyArray<MapDescriptor> | null>(null);
  const [projects, setProjects] = useState<ReadonlyArray<Project> | null>(null);
  const [nonce, setNonce] = useState(0);
  const failures = useRef(0);
  /**
   * The high-water mark. A pushed snapshot and a GET can be in flight at once;
   * whichever carries the *older* revision loses, whichever way round they
   * resolve. This is the entire reason `revision` exists.
   */
  const newest = useRef(-1);

  useEffect(() => {
    // Switching maps is a different subject, not a change: drop the old
    // snapshot rather than cross-fading stale structure into the new map.
    setSnapshot(null);
    newest.current = -1;
  }, [mapId]);

  useEffect(() => {
    const url = mapId === null ? "/api/events" : `/api/events?map=${encodeURIComponent(mapId)}`;
    const source = new EventSource(url);

    const onMaps = (event: MessageEvent<string>) => {
      failures.current = 0;
      setConnection("live");
      const next = (JSON.parse(event.data) as { maps: ReadonlyArray<MapDescriptor> }).maps;
      setMaps(next);
      queryClient.setQueryData(keys.maps, next);
    };

    const onProjects = (event: MessageEvent<string>) => {
      failures.current = 0;
      setConnection("live");
      const next = (JSON.parse(event.data) as { projects: ReadonlyArray<Project> }).projects;
      setProjects(next);
      queryClient.setQueryData(keys.projects, next);
      // Attach/detach is a complete new project list; maps follow on their own
      // event, but invalidate so a GET cannot linger on a detached project's
      // descriptors if the maps tick is a beat behind.
      void queryClient.invalidateQueries({ queryKey: keys.maps });
    };

    const onMap = (event: MessageEvent<string>) => {
      failures.current = 0;
      setConnection("live");
      const next = JSON.parse(event.data) as MapSnapshot;
      if (next.revision <= newest.current) return;
      newest.current = next.revision;
      setSnapshot(next);
      queryClient.setQueryData(keys.snapshot(next.id), next);
    };

    const onOpen = () => {
      failures.current = 0;
      setConnection("live");
    };
    const onError = () => {
      failures.current += 1;
      // The map stays fully interactive on the last snapshot, marked stale —
      // `EventSource` retries forever on its own, honouring our `retry:` frame.
      setConnection(failures.current >= OFFLINE_AFTER ? "offline" : "reconnecting");
    };

    source.addEventListener("maps", onMaps as EventListener);
    source.addEventListener("projects", onProjects as EventListener);
    source.addEventListener("map", onMap as EventListener);
    source.addEventListener("open", onOpen);
    source.addEventListener("error", onError);

    return () => {
      source.removeEventListener("maps", onMaps as EventListener);
      source.removeEventListener("projects", onProjects as EventListener);
      source.removeEventListener("map", onMap as EventListener);
      source.removeEventListener("open", onOpen);
      source.removeEventListener("error", onError);
      source.close();
    };
  }, [mapId, queryClient, nonce]);

  return {
    connection,
    snapshot,
    maps,
    projects,
    stale: snapshot !== null && connection !== "live" && connection !== "connecting",
    // "Retry now" beside the automatic backoff: a person who knows the network
    // came back should not have to wait out a timer.
    retryNow: () => setNonce((n) => n + 1),
  };
};

/**
 * Accept a snapshot that arrived by GET, but only if the feed has not already
 * pushed something newer. Kept here beside the high-water mark so there is one
 * rule about revision ordering, not two.
 */
export const newerOf = (a: MapSnapshot | null, b: MapSnapshot | null): MapSnapshot | null => {
  if (a === null) return b;
  if (b === null) return a;
  return b.revision > a.revision ? b : a;
};
