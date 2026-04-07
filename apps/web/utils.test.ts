import { describe, expect, it } from "vitest";
import { cn } from "./lib/utils";

describe("cn", () => {
  it("joins multiple class names with spaces", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("filters out false", () => {
    expect(cn("foo", false, "bar")).toBe("foo bar");
  });

  it("filters out null", () => {
    expect(cn("foo", null, "bar")).toBe("foo bar");
  });

  it("filters out undefined", () => {
    expect(cn("foo", undefined, "bar")).toBe("foo bar");
  });

  it("returns an empty string when called with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("returns an empty string when all arguments are falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });

  it("returns a single class name unchanged", () => {
    expect(cn("single")).toBe("single");
  });

  it("handles a mix of truthy and falsy values in any order", () => {
    expect(cn("a", false, "b", null, "c", undefined)).toBe("a b c");
  });

  it("preserves classes that contain spaces (passes them through as-is)", () => {
    expect(cn("foo bar", "baz")).toBe("foo bar baz");
  });
});
