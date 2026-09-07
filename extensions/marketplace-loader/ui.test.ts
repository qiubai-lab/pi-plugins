import { describe, expect, it, vi } from "vitest";
import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type Component } from "@earendil-works/pi-tui";
import { limitSettingsDescription, SearchableSelectScreen, showPluginSettings } from "./ui.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const items = [
  { value: "alpha", label: "Alpha", description: "First item" },
  { value: "beta", label: "Beta", description: "Second item" },
];

describe("marketplace TUI components", () => {
  it("renders searchable selections within narrow terminal width", () => {
    const done = vi.fn();
    const screen = new SearchableSelectScreen("Marketplace Manager", items, "enter select · esc close", theme, done);
    const lines = screen.render(22);
    expect(lines.every(line => visibleWidth(line) <= 22)).toBe(true);
    screen.handleInput("z");
    const filteredLines = screen.render(22);
    expect(filteredLines.join("\n")).toContain("No matching");
    expect(filteredLines).toHaveLength(lines.length);
    screen.handleInput("\x1b");
    expect(done).toHaveBeenCalledWith(null);
  });

  it("scrolls an overflowing selected description without exceeding terminal width", () => {
    const screen = new SearchableSelectScreen("Marketplace Manager", [{
      value: "long",
      label: "Plugin 安装（仓库）",
      description: "作用域：当前仓库；复制到 .agents/skills，可供其他 Agent 发现",
    }], "footer", theme, vi.fn());
    const before = screen.render(52);
    expect(screen.advanceMarquee()).toBe(true);
    const after = screen.render(52);
    expect(after.join("\n")).not.toBe(before.join("\n"));
    expect(after.every(line => visibleWidth(line) <= 52)).toBe(true);
    screen.dispose();
  });

  it("constructs independent screens and selects with keyboard input", () => {
    const firstDone = vi.fn();
    const secondDone = vi.fn();
    const first = new SearchableSelectScreen("First", items, "footer", theme, firstDone);
    const second = new SearchableSelectScreen("Second", items, "footer", theme, secondDone);
    first.handleInput("\x1b[B");
    first.handleInput("\r");
    second.handleInput("\r");
    expect(firstDone).toHaveBeenCalledWith("beta");
    expect(secondDone).toHaveBeenCalledWith("alpha");
  });

  it("keeps plugin descriptions at two lines and ellipsizes overflow", () => {
    const long = limitSettingsDescription([
      "item",
      "",
      "  first line",
      "  second line",
      "  third line",
      "",
      "hint",
    ], 20, text => text);
    expect(long).toEqual(["item", "", "  first line", "  second line...", "", "hint"]);

    const short = limitSettingsDescription(["item", "", "  only line", "", "hint"], 20, text => text);
    expect(short).toEqual(["item", "", "  only line", "  ", "", "hint"]);
  });

  it("shows a non-blocking hint when a plugin is enabled in the other scope", async () => {
    const plugin = {
      name: "alpha",
      description: "Alpha plugin",
      skillRoot: "/alpha",
      skillNames: ["alpha-skill"],
      skillDirectories: { "alpha-skill": "/alpha/alpha-skill" },
      installation: "AVAILABLE" as const,
      unsupportedCapabilities: [],
    };
    const render = async (scope: "personal" | "project") => {
      let output = "";
      const ctx = {
        ui: {
          custom<T>(factory: Function): Promise<T> {
            return new Promise(resolve => {
              const component = factory({ requestRender() {} }, theme, {}, resolve) as Component;
              output = component.render(100).join("\n");
              component.handleInput?.("\x1b");
            });
          },
        },
      } as unknown as ExtensionCommandContext;
      await showPluginSettings(ctx, "fixture-market", [{ plugin, enabled: false, otherScopeEnabled: true }], { scope });
      return output;
    };
    const personal = await render("personal");
    expect(personal).toContain("[ ] 未安装 · 已安装到仓库配置中");
    expect(personal).toContain("提示：已安装到仓库配置中");
    const project = await render("project");
    expect(project).toContain("[ ] 未安装 · 已安装到个人配置中");
    expect(project).toContain("提示：已安装到个人配置中");
  });

  it("saves plugin drafts with ctrl+s and saves changed drafts on escape", async () => {
    const plugins = [
      {
        plugin: {
          name: "alpha",
          description: "Alpha plugin",
          skillRoot: "/alpha",
          skillNames: ["alpha-skill"],
          skillDirectories: { "alpha-skill": "/alpha/alpha-skill" } as Record<string, string>,
          installation: "AVAILABLE" as const,
          unsupportedCapabilities: ["mcp"],
        },
        enabled: false,
        otherScopeEnabled: true,
      },
      {
        plugin: {
          name: "blocked",
          description: "Blocked plugin",
          skillRoot: "/blocked",
          skillNames: ["blocked-skill"],
          skillDirectories: { "blocked-skill": "/blocked/blocked-skill" } as Record<string, string>,
          installation: "NOT_AVAILABLE" as const,
          unsupportedCapabilities: [],
        },
        enabled: false,
      },
    ];

    const drive = async (inputs: string[], source = plugins) => {
      const ctx = {
        ui: {
          custom<T>(factory: Function): Promise<T> {
            return new Promise(resolve => {
              const component = factory({ requestRender() {} }, theme, {}, resolve) as Component;
              expect(component.render(28).every(line => visibleWidth(line) <= 28)).toBe(true);
              for (const input of inputs) component.handleInput?.(input);
            });
          },
        },
      } as unknown as ExtensionCommandContext;
      return showPluginSettings(ctx, "fixture-market", source);
    };

    await expect(drive([" ", "\x13"])).resolves.toEqual({ save: true, enabled: ["alpha"] });
    await expect(drive(["\x1b[B", " ", "\x13"])).resolves.toEqual({ save: true, enabled: [] });
    await expect(drive([" ", "\x1b"])).resolves.toEqual({ save: true, enabled: ["alpha"] });
    const installed = plugins.map((item, index) => index === 0 ? { ...item, enabled: true } : item);
    await expect(drive([" ", "\x1b"], installed)).resolves.toEqual({ save: true, enabled: [] });
    await expect(drive([" ", "\x13"], installed)).resolves.toEqual({ save: true, enabled: [] });
    await expect(drive(["\x1b"])).resolves.toEqual({ save: false, enabled: [] });
  });
});
