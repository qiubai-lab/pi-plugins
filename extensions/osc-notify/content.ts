export type NotificationContentMode = "result" | "status";

export interface ContentConfigurationResolution {
  mode: NotificationContentMode;
  invalidValue?: string;
  source?: "--osc-notify-content" | "PI_OSC_NOTIFY_CONTENT";
}

export interface AssistantNotificationMessage {
  stopReason: string;
  content: ReadonlyArray<{ type: string; text?: string }>;
  errorMessage?: string;
}

export const STATIC_STATUS_BODY = "已完成，等待输入";
export const TEST_NOTIFICATION_BODY = "通知正文测试";
const MAX_EXCERPT_CODE_POINTS = 160;
const CONTENT_MODES = new Set<NotificationContentMode>(["result", "status"]);

export function resolveConfiguredContentMode(
  cliValue: unknown,
  environmentValue: unknown,
): ContentConfigurationResolution {
  const selected = cliValue !== undefined
    ? { value: cliValue, source: "--osc-notify-content" as const }
    : environmentValue !== undefined
      ? { value: environmentValue, source: "PI_OSC_NOTIFY_CONTENT" as const }
      : undefined;

  if (!selected) return { mode: "result" };
  if (typeof selected.value === "string") {
    const mode = selected.value.trim().toLowerCase();
    if (CONTENT_MODES.has(mode as NotificationContentMode)) {
      return { mode: mode as NotificationContentMode };
    }
  }

  return {
    mode: "result",
    invalidValue: String(selected.value),
    source: selected.source,
  };
}

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateExcerpt(value: string): string {
  const codePoints = Array.from(value);
  if (codePoints.length <= MAX_EXCERPT_CODE_POINTS) return value;
  return `${codePoints.slice(0, MAX_EXCERPT_CODE_POINTS - 1).join("").trimEnd()}…`;
}

export function createNotificationBody(message: AssistantNotificationMessage): string {
  if (message.stopReason === "length") return "回复已截断，请返回 Pi 查看";
  if (message.stopReason === "aborted") return "运行已停止";
  if (message.stopReason === "error") return "运行失败，请返回 Pi 查看";
  if (message.stopReason !== "stop") return STATIC_STATUS_BODY;

  const text = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map(block => block.text)
    .join("\n");
  const excerpt = plainText(text);
  return excerpt ? truncateExcerpt(excerpt) : STATIC_STATUS_BODY;
}
