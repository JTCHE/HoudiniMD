import { expect, test } from "bun:test";
import { visitorLabel } from "./visitor-label";

test("gives each visitor hash a stable compact label", () => {
  expect(visitorLabel("kgcmd6")).toBe(visitorLabel("kgcmd6"));
  expect(visitorLabel("kgcmd6")).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  expect(visitorLabel("kgcmd6")).not.toBe(visitorLabel("9njwkh"));
});
