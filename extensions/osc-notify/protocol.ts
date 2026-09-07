export type NotificationProtocol = "bell" | "osc9" | "osc777";
export type NotificationMode = NotificationProtocol | "auto" | "off";

export interface ConfigurationResolution {
  mode: NotificationMode;
  invalidValue?: string;
  source?: "--osc-notify-protocol" | "PI_OSC_NOTIFY_PROTOCOL";
}

const MODES = new Set<NotificationMode>(["auto", "bell", "osc9", "osc777", "off"]);
const BIDI_CONTROLS = new Set([0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);

function parseMode(value: unknown): NotificationMode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return MODES.has(normalized as NotificationMode) ? normalized as NotificationMode : undefined;
}

export function resolveConfiguredMode(
  cliValue: unknown,
  environmentValue: unknown,
): ConfigurationResolution {
  const selected = cliValue !== undefined
    ? { value: cliValue, source: "--osc-notify-protocol" as const }
    : environmentValue !== undefined
      ? { value: environmentValue, source: "PI_OSC_NOTIFY_PROTOCOL" as const }
      : undefined;

  if (!selected) return { mode: "auto" };

  const mode = parseMode(selected.value);
  if (mode) return { mode };

  return {
    mode: "auto",
    invalidValue: String(selected.value),
    source: selected.source,
  };
}

export function resolveProtocol(
  mode: NotificationMode,
  environment: NodeJS.ProcessEnv,
): NotificationProtocol | "off" {
  if (mode !== "auto") return mode;

  const termProgram = environment.TERM_PROGRAM?.trim().toLowerCase() ?? "";
  if (termProgram === "iterm.app" || termProgram.includes("ghostty")) return "osc9";

  // Qterm intentionally exposes generic terminal identities, so the private
  // package's unknown-terminal default must retain OSC 777.
  return "osc777";
}

export function sanitizeNotificationText(
  value: string,
  maximumCodePoints: number,
  replaceSemicolons = false,
): string {
  const safe: string[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) || BIDI_CONTROLS.has(codePoint)) {
      continue;
    }
    safe.push(replaceSemicolons && character === ";" ? "；" : character);
    if (safe.length === maximumCodePoints) break;
  }
  return safe.join("").trim();
}

export function encodeNotification(
  protocol: NotificationProtocol,
  title: string,
  body: string,
): string {
  if (protocol === "bell") return "\x07";

  const safeTitle = sanitizeNotificationText(title, 128, protocol === "osc777");
  const safeBody = sanitizeNotificationText(body, 1024, protocol === "osc777");

  if (protocol === "osc9") {
    const text = [safeTitle, safeBody].filter(Boolean).join(": ") || "Pi";
    return `\x1b]9;${text}\x1b\\`;
  }

  return `\x1b]777;notify;${safeTitle || "Pi"};${safeBody}\x1b\\`;
}
