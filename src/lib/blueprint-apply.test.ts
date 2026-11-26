import { describe, expect, it } from "vitest";
import { planBlueprintApply } from "./blueprint-apply";

const existing = [
  { id: "m1", lessons: [{ id: "l1" }, { id: "l2" }] },
  { id: "m2", lessons: [{ id: "l3" }] },
];

describe("planBlueprintApply", () => {
  it("keeps every module and lesson when only titles change", () => {
    const plan = planBlueprintApply(existing, [
      { id: "m1", title: "Renamed", lessons: [{ id: "l1", title: "A" }, { id: "l2", title: "B" }] },
      { id: "m2", title: "Two", lessons: [{ id: "l3", title: "C" }] },
    ]);
    expect(plan.deleteModuleIds).toEqual([]);
    expect(plan.deleteLessonIds).toEqual([]);
    expect(plan.modules[0]).toMatchObject({ id: "m1", title: "Renamed", order: 0 });
    expect(plan.modules[0].lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("deletes only what the author removed", () => {
    const plan = planBlueprintApply(existing, [
      { id: "m1", title: "One", lessons: [{ id: "l2", title: "B" }] },
    ]);
    expect(plan.deleteModuleIds).toEqual(["m2"]);
    expect(plan.deleteLessonIds.sort()).toEqual(["l1", "l3"]);
    expect(plan.modules[0].lessons).toEqual([{ id: "l2", title: "B", order: 0 }]);
  });

  it("creates modules and lessons that have no id", () => {
    const plan = planBlueprintApply(existing, [
      { id: "m1", title: "One", lessons: [{ id: "l1", title: "A" }, { id: "l2", title: "B" }, { title: "New" }] },
      { id: "m2", title: "Two", lessons: [{ id: "l3", title: "C" }] },
      { title: "Three", lessons: [{ title: "First" }] },
    ]);
    expect(plan.deleteModuleIds).toEqual([]);
    expect(plan.deleteLessonIds).toEqual([]);
    expect(plan.modules[0].lessons[2]).toEqual({ id: undefined, title: "New", order: 2 });
    expect(plan.modules[2]).toMatchObject({ id: undefined, title: "Three", order: 2 });
  });

  it("ignores ids from another course and duplicate ids", () => {
    const plan = planBlueprintApply(existing, [
      { id: "foreign", title: "X", lessons: [{ id: "l1", title: "A" }, { id: "l1", title: "Again" }] },
    ]);
    expect(plan.modules[0].id).toBeUndefined();
    expect(plan.modules[0].lessons.map((l) => l.id)).toEqual(["l1", undefined]);
    expect(plan.deleteModuleIds.sort()).toEqual(["m1", "m2"]);
  });

  it("moves a kept lesson to a different module", () => {
    const plan = planBlueprintApply(existing, [
      { id: "m1", title: "One", lessons: [{ id: "l1", title: "A" }] },
      { id: "m2", title: "Two", lessons: [{ id: "l3", title: "C" }, { id: "l2", title: "B" }] },
    ]);
    expect(plan.deleteLessonIds).toEqual([]);
    expect(plan.modules[1].lessons[1]).toEqual({ id: "l2", title: "B", order: 1 });
  });

  it("falls back to numbered titles when a title is blank", () => {
    const plan = planBlueprintApply([], [{ title: " ", lessons: [{ title: "" }] }]);
    expect(plan.modules[0].title).toBe("Module 1");
    expect(plan.modules[0].lessons[0].title).toBe("Lesson 1");
  });
});
