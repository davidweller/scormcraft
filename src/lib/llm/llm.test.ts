import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractJsonText, parseJsonObject } from "./json";
import { parseClaudeCliOutput } from "./claude-cli";

/** Whether the mocked Claude CLI reports a signed-in subscription. */
const cli = vi.hoisted(() => ({ signedIn: true }));

vi.mock("./claude-cli", async (orig) => {
  const real = await orig<typeof import("./claude-cli")>();
  return { ...real, claudeCliStatus: vi.fn(async () => ({ installed: true, signedIn: cli.signedIn })) };
});

describe("parseJsonObject", () => {
  it("accepts bare JSON", () => {
    expect(parseJsonObject<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a code fence", () => {
    expect(parseJsonObject('```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
  });

  it("takes the outermost object when prose surrounds it", () => {
    expect(extractJsonText('Here you go:\n{"a":{"b":2}}\nHope that helps.')).toBe('{"a":{"b":2}}');
  });

  it("rejects an empty reply", () => {
    expect(() => parseJsonObject("  ")).toThrow("Empty AI response");
  });
});

describe("parseClaudeCliOutput", () => {
  it("reads the result object from `claude -p --output-format json`", () => {
    const out = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: '{"modules":[{"title":"One"}]}',
      modelUsage: { "claude-opus-5-5": { costUSD: 0.02 } },
    });
    const parsed = parseClaudeCliOutput(`warning: something\n${out}`);
    expect(parsed.subtype).toBe("success");
    expect(parseJsonObject(parsed.result!)).toEqual({ modules: [{ title: "One" }] });
  });

  it("throws on empty output", () => {
    expect(() => parseClaudeCliOutput("")).toThrow();
  });
});

describe("getLlm provider resolution", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scorm-llm-"));
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("SETTINGS_PATH", join(dir, "settings.json"));
    cli.signedIn = true;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails with a setup error when nothing is configured", async () => {
    cli.signedIn = false;
    const { getLlm, LlmSetupError } = await import("./index");
    await expect(getLlm(null)).rejects.toBeInstanceOf(LlmSetupError);
  });

  it("uses an OpenAI env key when no subscription is signed in", async () => {
    cli.signedIn = false;
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const { getLlm } = await import("./index");
    expect((await getLlm(null)).id).toBe("openai-api");
  });

  it("prefers the course's choice and BYO key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const { getLlm } = await import("./index");
    const llm = await getLlm({ aiProvider: "anthropic-api", apiKeys: { anthropic: "sk-ant-test" } });
    expect(llm.id).toBe("anthropic-api");
  });

  it("defaults to the Claude subscription when signed in", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const { getLlm } = await import("./index");
    expect((await getLlm(null)).id).toBe("claude-subscription");
  });

  it("honours the app default from settings.json", async () => {
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ defaultProvider: "chatgpt-subscription", models: {}, apiKeys: {} })
    );
    const { getLlm } = await import("./index");
    expect((await getLlm(null)).id).toBe("chatgpt-subscription");
  });

  it("reads API keys from settings.json", async () => {
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ defaultProvider: "anthropic-api", apiKeys: { anthropic: "sk-ant-x" } })
    );
    const { resolveApiKey } = await import("@/lib/settings");
    expect(resolveApiKey("anthropic")).toBe("sk-ant-x");
    expect(resolveApiKey("anthropic", "course-key")).toBe("course-key");
  });
});
