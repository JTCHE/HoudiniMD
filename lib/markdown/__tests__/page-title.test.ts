import { describe, it, expect } from "bun:test";
import { formatPageTitle } from "../page-title";

describe("formatPageTitle", () => {
  it("splits a geometry node title", () => {
    expect(formatPageTitle("Box", "geometry node")).toBe("Box – Geometry Node");
  });

  it("splits an expression function title and lowercases internal letters", () => {
    expect(formatPageTitle("opinput", "expression function")).toBe("Opinput – Expression Function");
  });

  it("keeps only the first letter of an all-caps type word capitalized", () => {
    expect(formatPageTitle("point", "VEX function")).toBe("Point – Vex Function");
  });

  it("degrades to a title-cased name when there is no type", () => {
    expect(formatPageTitle("VEX")).toBe("Vex");
    expect(formatPageTitle("Introduction to nodes")).toBe("Introduction to Nodes");
  });

  it("lowercases minor words mid-title but not at the edges", () => {
    expect(formatPageTitle("The Art of Simulation")).toBe("The Art of Simulation");
    expect(formatPageTitle("point in a box", "expression function")).toBe(
      "Point in a Box – Expression Function",
    );
  });

  it("handles an empty type gracefully", () => {
    expect(formatPageTitle("hou.Node", "")).toBe("Hou.node");
  });
});
