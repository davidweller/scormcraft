import { describe, expect, it } from "vitest";
import { mergeCourseSettings } from "./course-settings";

describe("mergeCourseSettings", () => {
  it("adds a key without dropping the others", () => {
    expect(mergeCourseSettings({ apiKeys: { openai: "a" } }, { apiKeys: { gemini: "g" } })).toEqual({
      apiKeys: { openai: "a", gemini: "g" },
    });
  });

  it("removes one key on null", () => {
    expect(
      mergeCourseSettings({ apiKeys: { openai: "a", gemini: "g" }, aiProvider: "openai-api" }, { apiKeys: { openai: null } })
    ).toEqual({ apiKeys: { gemini: "g" }, aiProvider: "openai-api" });
  });

  it("sets and clears the provider", () => {
    expect(mergeCourseSettings({}, { aiProvider: "claude-subscription" })).toEqual({ aiProvider: "claude-subscription" });
    expect(mergeCourseSettings({ aiProvider: "x" }, { aiProvider: null })).toEqual({});
  });

  it("tolerates missing current settings", () => {
    expect(mergeCourseSettings(null, { apiKeys: { anthropic: "k" } })).toEqual({ apiKeys: { anthropic: "k" } });
  });
});
