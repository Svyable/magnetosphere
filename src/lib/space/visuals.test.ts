import { describe, it, expect } from "vitest";
import { FIELD_DETAIL, FIELD_DETAIL_CHOICES, parseFieldDetail, schematicPathUpperBound } from "./visuals";

describe("schematic field-line display comfort", () => {
  it("provides three intentional display modes and a nonempty line budget", () => {
    expect(FIELD_DETAIL_CHOICES).toEqual(["quiet", "balanced", "detailed"]);
    expect(schematicPathUpperBound("quiet")).toBe(10);
    expect(schematicPathUpperBound("balanced")).toBe(28);
    expect(schematicPathUpperBound("detailed")).toBe(80);
  });
  it("increases both geometric detail and opacity only on request", () => {
    expect(FIELD_DETAIL.quiet.closedOpacity).toBeLessThan(FIELD_DETAIL.balanced.closedOpacity);
    expect(FIELD_DETAIL.balanced.openOpacity).toBeLessThan(FIELD_DETAIL.detailed.openOpacity);
    expect(schematicPathUpperBound("balanced")).toBeLessThan(schematicPathUpperBound("detailed"));
  });
  it("rejects garbage URL values rather than allowing arbitrary object keys", () => {
    expect(parseFieldDetail("quiet")).toBe("quiet");
    expect(parseFieldDetail("balanced")).toBe("balanced");
    expect(parseFieldDetail("detailed")).toBe("detailed");
    expect(parseFieldDetail("max")).toBeNull();
    expect(parseFieldDetail("__proto__")).toBeNull();
    expect(parseFieldDetail(null)).toBeNull();
  });
});
