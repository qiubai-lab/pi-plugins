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
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { MarketplaceSummary, PluginStatus } from "./service.ts";
import type { MarketplaceSourceState } from "./state.ts";

export type MarketplaceChoice =
  | { kind: "add" }
  | { kind: "doctor" }
  | { kind: "source"; marketplace: string };

export type SourceChoice = "plugins" | "project-plugins" | "update" | "remove" | "back";

export interface PluginDraftResult {
  save: boolean;
  enabled: string[];
}

class SearchableSelectScreen implements Component, Focusable {
  private readonly border: DynamicBorder;
  private readonly input: Input;
  private readonly list: SelectList;
  private readonly listViewportHeight: number;
  private readonly descriptions = new Map<SelectItem, string>();
  private marqueeOffset = 0;
  private descriptionWidth = 0;

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
    for (const item of items) {
      if (item.description) this.descriptions.set(item, item.description);
    }
    const maxVisible = Math.min(Math.max(items.length, 3), 14);
    this.listViewportHeight = maxVisible + (items.length > maxVisible ? 1 : 0);
    this.list = new SelectList(items, maxVisible, {
      selectedPrefix: text => theme.fg("accent", text),
      selectedText: text => theme.fg("accent", text),
      description: text => theme.fg("muted", text),
      scrollInfo: text => theme.fg("dim", text),
      noMatch: text => theme.fg("warning", text),
    });
    this.list.onSelectionChange = () => { this.marqueeOffset = 0; };
    this.list.onSelect = item => done(item.value);
    this.list.onCancel = () => done(null);
  }

  get focused(): boolean { return this.input.focused; }
  set focused(value: boolean) { this.input.focused = value; }

  private updateMarquee(): void {
    for (const [item, description] of this.descriptions) item.description = description;
    const selected = this.list.getSelectedItem();
    const description = selected ? this.descriptions.get(selected) : undefined;
    if (!selected || !description || this.descriptionWidth <= 0 || visibleWidth(description) <= this.descriptionWidth) return;
    const cycle = `${description}   `;
    const cycleWidth = visibleWidth(cycle);
    const doubled = cycle + cycle;
    selected.description = sliceByColumn(doubled, this.marqueeOffset % cycleWidth, cycleWidth, true);
  }

  advanceMarquee(): boolean {
    const selected = this.list.getSelectedItem();
    const description = selected ? this.descriptions.get(selected) : undefined;
    if (!description || this.descriptionWidth <= 0 || visibleWidth(description) <= this.descriptionWidth) return false;
    this.marqueeOffset += 1;
    return true;
  }

  dispose(): void {
    for (const [item, description] of this.descriptions) item.description = description;
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const primaryWidth = Math.max(1, Math.min(32, innerWidth - 6));
    this.descriptionWidth = innerWidth > 40 ? Math.max(0, innerWidth - 2 - primaryWidth - 2) : 0;
    this.updateMarquee();
    const listLines = this.list.render(innerWidth);
    const paddedListLines = [
      ...listLines,
      ...Array(Math.max(0, this.listViewportHeight - listLines.length)).fill(""),
    ];
    return [
      ...this.border.render(width),
      truncateToWidth(` ${this.theme.fg("accent", this.theme.bold(this.title))}`, width, ""),
      ...this.input.render(innerWidth).map(line => truncateToWidth(` ${line}`, width, "")),
      "",
      ...paddedListLines.map(line => truncateToWidth(` ${line}`, width, "")),
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
    this.marqueeOffset = 0;
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
    let timer: ReturnType<typeof setInterval> | undefined;
    const finish = (value: string | null) => {
      if (timer) clearInterval(timer);
      screen.dispose();
      done(value);
    };
    const screen = new SearchableSelectScreen(title, items, footer, theme, finish);
    timer = setInterval(() => {
      if (screen.advanceMarquee()) tui.requestRender();
    }, 250);
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
    { value: "plugins", label: "Plugin 安装（个人）", description: "作用域：所有仓库；保存在个人配置中，仅由 Pi 加载" },
    { value: "project-plugins", label: "Plugin 安装（仓库）", description: "作用域：当前仓库；复制到 .agents/skills，可供其他 Agent 发现" },
    { value: "update", label: "更新 Marketplace", description: `${source.ref} @ ${source.commit.slice(0, 12)}` },
    { value: "remove", label: "移除 Marketplace", description: "删除私有快照和选择状态" },
    { value: "back", label: "返回", description: "返回 Marketplace 列表" },
  ], "Enter 选择 · Esc 返回");
  return (selected ?? "back") as SourceChoice;
}

export function limitSettingsDescription(
  lines: string[],
  width: number,
  style: (text: string) => string,
): string[] {
  const trailingBlank = lines.length - 2;
  if (trailingBlank <= 0 || visibleWidth(lines[trailingBlank] ?? "") !== 0) return lines;
  let separator = trailingBlank - 1;
  while (separator >= 0 && visibleWidth(lines[separator] ?? "") !== 0) separator -= 1;
  if (separator < 0) return lines;

  const description = lines.slice(separator + 1, trailingBlank);
  const fixed = description.slice(0, 2);
  if (description.length > 2 && fixed[1] !== undefined) {
    const ellipsis = style("...");
    fixed[1] = truncateToWidth(fixed[1], Math.max(0, width - visibleWidth(ellipsis)), "") + ellipsis;
  }
  while (fixed.length < 2) fixed.push(style("  "));
  return [...lines.slice(0, separator + 1), ...fixed, ...lines.slice(trailingBlank)];
}

export async function showPluginSettings(
  ctx: ExtensionCommandContext,
  marketplace: string,
  plugins: PluginStatus[],
  options: { scope?: "personal" | "project"; projectRoot?: string } = {},
): Promise<PluginDraftResult> {
  const project = options.scope === "project";
  const enabled = new Set(
    plugins
      .filter(item => item.enabled && item.plugin.installation !== "NOT_AVAILABLE")
      .map(item => item.plugin.name),
  );
  const initialEnabled = new Set(enabled);
  const hasChanges = () => enabled.size !== initialEnabled.size
    || [...enabled].some(name => !initialEnabled.has(name));
  return ctx.ui.custom<PluginDraftResult>((tui, theme, _keybindings, done) => {
    const items: SettingItem[] = plugins.map(({ plugin, enabled: isEnabled, otherScopeEnabled }) => {
      const ignored = plugin.unsupportedCapabilities.length
        ? ` 已忽略：${plugin.unsupportedCapabilities.join(", ")}。`
        : "";
      const otherScope = otherScopeEnabled
        ? project ? " 提示：已安装到个人配置中。" : " 提示：已安装到仓库配置中。"
        : "";
      const otherScopeLabel = project ? "个人" : "仓库";
      const enabledValue = "[*] 已安装";
      const disabledValue = "[ ] 未安装";
      const scopeSuffix = otherScopeEnabled ? ` · 已安装到${otherScopeLabel}配置中` : "";
      const unavailable = plugin.installation === "NOT_AVAILABLE";
      return {
        id: plugin.name,
        label: plugin.name,
        description: `${plugin.description} · ${plugin.skillNames.length} 个 Skill。${ignored}${otherScope}`,
        currentValue: unavailable ? "不可用" : `${isEnabled ? enabledValue : disabledValue}${scopeSuffix}`,
        values: unavailable ? undefined : [`${enabledValue}${scopeSuffix}`, `${disabledValue}${scopeSuffix}`],
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
        if (value.startsWith("[*]")) enabled.add(id);
        else enabled.delete(id);
      },
      () => done({ save: hasChanges(), enabled: [...enabled].sort() }),
      { enableSearch: true },
    );
    const border = new DynamicBorder((text: string) => theme.fg("accent", text));
    let settingsViewportWidth = -1;
    let settingsViewportHeight = 0;
    return {
      render(width: number) {
        const innerWidth = Math.max(1, width - 2);
        const limitedSettings = limitSettingsDescription(settings.render(innerWidth), innerWidth, settingsTheme.description);
        if (settingsViewportWidth !== innerWidth) {
          settingsViewportWidth = innerWidth;
          settingsViewportHeight = limitedSettings.length;
        } else {
          settingsViewportHeight = Math.max(settingsViewportHeight, limitedSettings.length);
        }
        const settingsLines = [
          ...limitedSettings,
          ...Array(Math.max(0, settingsViewportHeight - limitedSettings.length)).fill(""),
        ];
        return [
          ...border.render(width),
          truncateToWidth(` ${theme.fg("accent", theme.bold(`Plugin · ${marketplace} · ${project ? "当前仓库" : "个人"}`))}`, width, ""),
          ...(project && options.projectRoot
            ? [truncateToWidth(` ${theme.fg("dim", `${options.projectRoot}/.agents/skills`)}`, width, "")]
            : []),
          ...settingsLines.map(line => truncateToWidth(` ${line}`, width, "")),
          truncateToWidth(` ${theme.fg("dim", "Space/Enter 切换 · Ctrl+S 保存 · Esc 保存并返回")}`, width, ""),
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
