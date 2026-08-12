/**
 * The types-only entry point. `packages/client` depends on core through *this*
 * — never through the package root, which pulls in adapters, `node:crypto` and
 * `@effect/platform` (SPEC.md §3: the client depends on core for types only).
 */
export * from "./model.js";
export * from "./derive.js";
