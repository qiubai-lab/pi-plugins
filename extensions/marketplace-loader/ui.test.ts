import { describe, expect, it, vi } from "vitest";
import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type Component } from "@earendil-works/pi-tui";
import { SearchableSelectScreen, showPluginSettings } from "./ui.ts";

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
    expect(screen.render(22).join("\n")).toContain("No matching");
    screen.handleInput("\x1b");
    expect(done).toHaveBeenCalledWith(null);
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

  it("saves plugin drafts with ctrl+s and discards them with escape", async () => {
    const plugins = [
      {
        plugin: {
          name: "alpha",
          description: "Alpha plugin",
          skillRoot: "/alpha",
          skillNames: ["alpha-skill"],
          installation: "AVAILABLE" as const,
          unsupportedCapabilities: ["mcp"],
        },
        enabled: false,
      },
      {
        plugin: {
          name: "blocked",
          description: "Blocked plugin",
          skillRoot: "/blocked",
          skillNames: ["blocked-skill"],
          installation: "NOT_AVAILABLE" as const,
          unsupportedCapabilities: [],
        },
        enabled: false,
      },
    ];

    const drive = async (inputs: string[]) => {
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
      return showPluginSettings(ctx, "fixture-market", plugins);
    };

    await expect(drive([" ", "\x13"])).resolves.toEqual({ save: true, enabled: ["alpha"] });
    await expect(drive(["\x1b[B", " ", "\x13"])).resolves.toEqual({ save: true, enabled: [] });
    await expect(drive(["\x1b"])).resolves.toEqual({ save: false, enabled: [] });
  });
});
