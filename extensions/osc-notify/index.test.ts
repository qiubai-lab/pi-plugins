import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerOscNotify, type NotificationOutput } from "./index.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => void | Promise<void>;

function harness(options: { flag?: string; contentFlag?: string; env?: NodeJS.ProcessEnv; isTTY?: boolean } = {}) {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, (args: string, ctx: ExtensionContext) => void | Promise<void>>();
  const chunks: string[] = [];
  const output: NotificationOutput = {
    isTTY: options.isTTY ?? true,
    write: chunk => { chunks.push(chunk); },
  };
  const pi = {
    on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    registerFlag: vi.fn(),
    getFlag: vi.fn((name: string) => name === "osc-notify-protocol" ? options.flag : options.contentFlag),
    registerCommand: vi.fn((name: string, command: { handler: (args: string, ctx: ExtensionContext) => void | Promise<void> }) => {
      commands.set(name, command.handler);
    }),
  } as unknown as ExtensionAPI;
  const notify = vi.fn();
  const context = (overrides: Partial<ExtensionContext> = {}) => ({
    mode: "tui",
    isIdle: () => true,
    ui: { notify },
    ...overrides,
  }) as unknown as ExtensionContext;

  registerOscNotify(pi, { env: options.env ?? {}, output });
  return { pi, handlers, commands, chunks, notify, context };
}

describe("Pi lifecycle adapter", () => {
  it("registers configuration and emits one notification only after agent settlement", async () => {
    const app = harness({ flag: "osc777" });

    expect(app.pi.registerFlag).toHaveBeenCalledWith("osc-notify-protocol", expect.objectContaining({ type: "string" }));
    expect(app.pi.registerFlag).toHaveBeenCalledWith("osc-notify-content", expect.objectContaining({ type: "string" }));
    expect(app.handlers.has("agent_end")).toBe(false);
    expect(app.chunks).toEqual([]);

    await app.handlers.get("agent_start")?.({}, app.context());
    await app.handlers.get("message_end")?.({
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "## 完成\n\nOSC 通知正文已经可用。" }],
      },
    }, app.context());
    await app.handlers.get("agent_settled")?.({}, app.context());
    expect(app.chunks).toEqual(["\x1b]777;notify;Pi;完成 OSC 通知正文已经可用。\x1b\\"]);
  });

  it.each([
    ["rpc", true, true],
    ["json", true, true],
    ["print", true, true],
    ["tui", false, true],
    ["tui", true, false],
  ] as const)("does not write for mode=%s, tty=%s, idle=%s", async (mode, isTTY, idle) => {
    const app = harness({ flag: "osc777", isTTY });
    await app.handlers.get("agent_settled")?.({}, app.context({ mode, isIdle: () => idle }));
    expect(app.chunks).toEqual([]);
  });

  it("does not write when notifications are off", async () => {
    const app = harness({ flag: "off" });
    await app.handlers.get("agent_settled")?.({}, app.context());
    expect(app.chunks).toEqual([]);
  });

  it("uses the privacy-oriented static body when content mode is status", async () => {
    const app = harness({ flag: "osc777", contentFlag: "status" });
    await app.handlers.get("message_end")?.({
      message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Sensitive result" }] },
    }, app.context());
    await app.handlers.get("agent_settled")?.({}, app.context());
    expect(app.chunks).toEqual(["\x1b]777;notify;Pi;已完成，等待输入\x1b\\"]);
  });

  it("warns once on session start and falls back to auto for invalid configuration", async () => {
    const app = harness({ flag: "wat", env: { TERM: "xterm-256color" } });
    await app.handlers.get("session_start")?.({}, app.context());
    expect(app.notify).toHaveBeenCalledWith(expect.stringContaining("wat"), "warning");

    await app.handlers.get("agent_settled")?.({}, app.context());
    expect(app.chunks).toEqual(["\x1b]777;notify;Pi;已完成，等待输入\x1b\\"]);
  });
});

describe("manual test command", () => {
  it("uses the production encoder for an explicit protocol", async () => {
    const app = harness();
    await app.commands.get("osc-notify-test")?.("osc9", app.context());
    expect(app.chunks).toEqual(["\x1b]9;Pi: 通知正文测试\x1b\\"]);
  });

  it("rejects invalid and off test arguments without writing bytes", async () => {
    const app = harness();
    await app.commands.get("osc-notify-test")?.("invalid", app.context());
    await app.commands.get("osc-notify-test")?.("off", app.context());
    expect(app.chunks).toEqual([]);
    expect(app.notify).toHaveBeenCalledTimes(2);
  });
});
