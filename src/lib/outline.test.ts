import { describe, expect, it } from "vitest";
import { moveBy, moveNextTo, moveToParent, outlineMatches, toOutline, type OutlineModule } from "./outline";

const course = (): OutlineModule[] => [
  { id: "m1", lessons: [{ id: "l1", pages: [{ id: "p1" }, { id: "p2" }] }, { id: "l2", pages: [{ id: "p3" }] }] },
  { id: "m2", lessons: [{ id: "l3", pages: [] }] },
  { id: "m3", lessons: [] },
];

/** A compact string of the outline, for readable assertions. */
function shape(modules: OutlineModule[] | null) {
  if (!modules) return null;
  return modules
    .map((m) => `${m.id}(${m.lessons.map((l) => `${l.id}[${l.pages.map((p) => p.id).join(",")}]`).join(" ")})`)
    .join(" ");
}

describe("moveNextTo", () => {
  it("reorders modules", () => {
    expect(shape(moveNextTo(course(), "m3", "m1", "before"))).toBe(
      "m3() m1(l1[p1,p2] l2[p3]) m2(l3[])"
    );
  });

  it("drops a module beside the module of the lesson it lands on", () => {
    expect(shape(moveNextTo(course(), "m1", "l3", "after"))).toBe(
      "m2(l3[]) m1(l1[p1,p2] l2[p3]) m3()"
    );
  });

  it("moves a lesson into another module beside a lesson", () => {
    expect(shape(moveNextTo(course(), "l1", "l3", "after"))).toBe(
      "m1(l2[p3]) m2(l3[] l1[p1,p2]) m3()"
    );
  });

  it("moves a lesson into an empty module by dropping on its header", () => {
    expect(shape(moveNextTo(course(), "l2", "m3", "after"))).toBe(
      "m1(l1[p1,p2]) m2(l3[]) m3(l2[p3])"
    );
  });

  it("moves a page into a lesson with no pages", () => {
    expect(shape(moveNextTo(course(), "p1", "l3", "after"))).toBe(
      "m1(l1[p2] l2[p3]) m2(l3[p1]) m3()"
    );
  });

  it("reorders pages within a lesson", () => {
    expect(shape(moveNextTo(course(), "p2", "p1", "before"))).toBe(
      "m1(l1[p2,p1] l2[p3]) m2(l3[]) m3()"
    );
  });

  it("refuses to drop a page on a module, or anything on itself", () => {
    expect(moveNextTo(course(), "p1", "m2", "after")).toBeNull();
    expect(moveNextTo(course(), "l1", "l1", "after")).toBeNull();
    expect(moveNextTo(course(), "m1", "l1", "after")).toBeNull();
  });

  it("does not change the input", () => {
    const input = course();
    moveNextTo(input, "p1", "p3", "after");
    expect(shape(input)).toBe(shape(course()));
  });
});

describe("moveBy", () => {
  it("moves within the parent", () => {
    expect(shape(moveBy(course(), "l2", "up"))).toBe("m1(l2[p3] l1[p1,p2]) m2(l3[]) m3()");
  });

  it("crosses into the neighbouring module at the edge", () => {
    expect(shape(moveBy(course(), "l3", "up"))).toBe("m1(l1[p1,p2] l2[p3] l3[]) m2() m3()");
    expect(shape(moveBy(course(), "l2", "down"))).toBe("m1(l1[p1,p2]) m2(l2[p3] l3[]) m3()");
  });

  it("moves a page into the next lesson, across a module boundary", () => {
    expect(shape(moveBy(course(), "p3", "down"))).toBe("m1(l1[p1,p2] l2[]) m2(l3[p3]) m3()");
  });

  it("returns null at the very top or bottom", () => {
    expect(moveBy(course(), "m1", "up")).toBeNull();
    expect(moveBy(course(), "p1", "up")).toBeNull();
    expect(moveBy(course(), "m3", "down")).toBeNull();
  });
});

describe("moveToParent", () => {
  it("moves a lesson to another module and a page to another lesson", () => {
    expect(shape(moveToParent(course(), "l1", "m3"))).toBe("m1(l2[p3]) m2(l3[]) m3(l1[p1,p2])");
    expect(shape(moveToParent(course(), "p3", "l1"))).toBe("m1(l1[p1,p2,p3] l2[]) m2(l3[]) m3()");
  });

  it("returns null for the current parent", () => {
    expect(moveToParent(course(), "l1", "m1")).toBeNull();
  });
});

describe("outlineMatches", () => {
  const existing = toOutline(course());

  it("accepts any rearrangement of the same items", () => {
    expect(outlineMatches(existing, toOutline(moveNextTo(course(), "p1", "l3", "after")!))).toBe(true);
  });

  it("rejects a missing, extra or repeated item", () => {
    const missing = toOutline(course());
    missing.modules[0].lessons[0].pages.pop();
    expect(outlineMatches(existing, missing)).toBe(false);

    const extra = toOutline(course());
    extra.modules[2].lessons.push({ id: "other", pages: [] });
    expect(outlineMatches(existing, extra)).toBe(false);

    const repeated = toOutline(course());
    repeated.modules[0].lessons[0].pages = ["p1", "p1"];
    expect(outlineMatches(existing, repeated)).toBe(false);
  });
});
