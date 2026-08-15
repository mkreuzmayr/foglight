/**
 * Project identity — basename slug plus a short hash of the canonical path.
 * Adapters never see this; qualification happens in the session layer.
 */
import { describe, expect, it } from "vitest";
import { idFor, qualify } from "../src/domain/project.js";

describe("project identity", () => {
  it("names a project from its folder basename and a short hash of the path", () => {
    expect(idFor("/home/michaelk/repos/foglight")).toBe("foglight-6cf2");
  });

  it("qualifies an adapter id by prefixing the project", () => {
    expect(qualify("foglight-3f2a", "local:.wayfinder/map.md")).toBe(
      "foglight-3f2a:local:.wayfinder/map.md",
    );
  });

  it("slugs the folder basename so the id stays URL-safe", () => {
    expect(idFor("/tmp/My Project")).toBe("my-project-dab3");
  });

  it("keeps two folders with the same name distinct", () => {
    expect(idFor("/tmp/foglight")).toBe("foglight-9dc3");
    expect(idFor("/home/other/foglight")).toBe("foglight-cfe1");
  });
});
