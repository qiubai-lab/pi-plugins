import {
  DynamicBorder,
  type ExtensionCommandContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  matchesKey,
  type Component,
  type Focusable,
  type SelectItem,
  SelectList,
  type SettingItem,
  SettingsList,
  type SettingsListTheme,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type { MarketplaceSummary } from "./service.ts";
import type { MarketplaceSourceState } from "./state.ts";
import type { ManagedPlugin } from "./catalog.ts";

export type MarketplaceChoice =
  | { kind: "add" }
  | { kind: "doctor" }
  | { kind: "source"; marketplace: string };

export type SourceChoice = "plugins" | "update" | "remove" | "back";

export interface PluginDraftResult {
  save: boolean;
  enabled: string[];
}

class SearchableSelectScreen implements Component, Focusable {
  private readonly border: DynamicBorder;
  private readonly input: Input;
  private readonly list: SelectList;

  constructor(
    private readonly title: string,
    items: SelectItem[],
    private readonly footer: string,
    private readonly theme: Theme,
    done: (value: string | null) => void,
  ) {
    this.border = new DynamicBorder((text: string) => theme.fg("accent", text));
    this.input = new Input({
      prompt: "搜索：",
      placeholder: "输入关键词筛选",
      placeholderStyle: text => theme.fg("dim", text),
    });
    this.list = new SelectList(items, Math.min(Math.max(items.length, 3), 14), {
      selectedPrefix: text => theme.fg("accent", text),
      selectedText: text => theme.fg("accent", text),
      description: text => theme.fg("muted", text),
      scrollInfo: text => theme.fg("dim", text),
      noMatch: text => theme.fg("warning", text),
    });
    this.list.onSelect = item => done(item.value);
    this.list.onCancel = () => done(null);
  }

  get focused(): boolean { return this.input.focused; }
  set focused(value: boolean) { this.input.focused = value; }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    return [
      ...this.border.render(width),
      truncateToWidth(` ${this.theme.fg("accent", this.theme.bold(this.title))}`, width, ""),
      ...this.input.render(innerWidth).map(line => truncateToWidth(` ${line}`, width, "")),
      "",
      ...this.list.render(innerWidth).map(line => truncateToWidth(` ${line}`, width, "")),
      "",
      truncateToWidth(` ${this.theme.fg("dim", this.footer)}`, width, ""),
      ...this.border.render(width),
    ];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
      this.list.handleInput(data);
      return;
    }
    this.input.handleInput(data);
    this.list.setFilter(this.input.getValue());
  }

  invalidate(): void {
    this.border.invalidate();
    this.input.invalidate();
    this.list.invalidate();
  }
}

function selectItemsThemeDescription(summary: MarketplaceSummary): string {
  return `${summary.source.ref} @ ${summary.source.commit.slice(0, 12)} · ${summary.pluginCount} 个 Plugin · 已启用 ${summary.enabledCount} 个`;
}

async function showSearchableSelect(
  ctx: ExtensionCommandContext,
  title: string,
  items: SelectItem[],
  footer: string,
): Promise<string | null> {
  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const screen = new SearchableSelectScreen(title, items, footer, theme, done);
    return {
      get focused() { return screen.focused; },
      set focused(value: boolean) { screen.focused = value; },
      render: width => screen.render(width),
      invalidate: () => screen.invalidate(),
      handleInput: data => {
        screen.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

export async function showMarketplaceList(
  ctx: ExtensionCommandContext,
  summaries: MarketplaceSummary[],
): Promise<MarketplaceChoice | null> {
  const items: SelectItem[] = [
    { value: "action:add", label: "+ 添加 Marketplace", description: "克隆并校验受信任的 Git 仓库" },
    { value: "action:doctor", label: "运行诊断", description: "校验快照、状态和失效资源" },
    ...summaries.map(summary => ({
      value: `source:${summary.source.name}`,
      label: summary.source.displayName,
      description: selectItemsThemeDescription(summary),
    })),
  ];
  const selected = await showSearchableSelect(
    ctx,
    "Marketplace 管理器",
    items,
    summaries.length === 0 ? "尚未配置来源 · Enter 选择 · Esc 关闭" : "Enter 选择 · 输入关键词搜索 · Esc 关闭",
  );
  if (selected === null) return null;
  if (selected === "action:add") return { kind: "add" };
  if (selected === "action:doctor") return { kind: "doctor" };
  return { kind: "source", marketplace: selected.slice("source:".length) };
}

export async function showSourceActions(
  ctx: ExtensionCommandContext,
  source: MarketplaceSourceState,
): Promise<SourceChoice> {
  const selected = await showSearchableSelect(ctx, source.displayName, [
    { value: "plugins", label: "管理 Plugin", description: "启用、停用并检查 Plugin Skill" },
    { value: "update", label: "更新快照", description: `${source.ref} @ ${source.commit.slice(0, 12)}` },
    { value: "remove", label: "移除 Marketplace", description: "删除私有快照和选择状态" },
    { value: "back", label: "返回", description: "返回 Marketplace 列表" },
  ], "Enter 选择 · Esc 返回");
  return (selected ?? "back") as SourceChoice;
}

export async function showPluginSettings(
  ctx: ExtensionCommandContext,
  marketplace: string,
  plugins: { plugin: ManagedPlugin; enabled: boolean }[],
): Promise<PluginDraftResult> {
  const enabled = new Set(
    plugins
      .filter(item => item.enabled && item.plugin.installation !== "NOT_AVAILABLE")
      .map(item => item.plugin.name),
  );
  return ctx.ui.custom<PluginDraftResult>((tui, theme, _keybindings, done) => {
    const items: SettingItem[] = plugins.map(({ plugin, enabled: isEnabled }) => {
      const ignored = plugin.unsupportedCapabilities.length
        ? ` 已忽略：${plugin.unsupportedCapabilities.join(", ")}。`
        : "";
      const unavailable = plugin.installation === "NOT_AVAILABLE";
      return {
        id: plugin.name,
        label: plugin.name,
        description: `${plugin.description} · ${plugin.skillNames.length} 个 Skill。${ignored}`,
        currentValue: unavailable ? "不可用" : isEnabled ? "已启用" : "已停用",
        values: unavailable ? undefined : ["已启用", "已停用"],
      };
    });
    const settingsTheme: SettingsListTheme = {
      label: (text, selected) => theme.fg(selected ? "accent" : "text", text),
      value: (text, selected) => theme.fg(selected ? "accent" : "muted", text),
      description: text => theme.fg("muted", text),
      cursor: theme.fg("accent", "> "),
      hint: text => theme.fg("dim", text),
    };
    const settings = new SettingsList(
      items,
      Math.min(Math.max(items.length + 2, 5), 16),
      settingsTheme,
      (id, value) => {
        if (value === "已启用") enabled.add(id);
        else enabled.delete(id);
      },
      () => done({ save: false, enabled: [] }),
      { enableSearch: true },
    );
    const border = new DynamicBorder((text: string) => theme.fg("accent", text));
    return {
      render(width: number) {
        return [
          ...border.render(width),
          truncateToWidth(` ${theme.fg("accent", theme.bold(`Plugin · ${marketplace}`))}`, width, ""),
          ...settings.render(Math.max(1, width - 2)).map(line => truncateToWidth(` ${line}`, width, "")),
          truncateToWidth(` ${theme.fg("dim", "Space/Enter 切换 · Ctrl+S 保存 · Esc 放弃")}`, width, ""),
          ...border.render(width),
        ];
      },
      invalidate() {
        border.invalidate();
        settings.invalidate();
      },
      handleInput(data: string) {
        if (matchesKey(data, Key.ctrl("s"))) done({ save: true, enabled: [...enabled].sort() });
        else settings.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

export { SearchableSelectScreen };
