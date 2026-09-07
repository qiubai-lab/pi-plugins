import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createNotificationBody,
  resolveConfiguredContentMode,
  STATIC_STATUS_BODY,
  TEST_NOTIFICATION_BODY,
} from "./content.ts";
import {
  encodeNotification,
  resolveConfiguredMode,
  resolveProtocol,
  type NotificationMode,
} from "./protocol.ts";

const NOTIFICATION_TITLE = "Pi";
const COMMAND_MODES = new Set<NotificationMode>(["auto", "bell", "osc9", "osc777"]);

export interface NotificationOutput {
  readonly isTTY: boolean;
  write(chunk: string): void;
}

export interface OscNotifyOptions {
  env?: NodeJS.ProcessEnv;
  output?: NotificationOutput;
}

const stdout: NotificationOutput = {
  get isTTY() {
    return process.stdout.isTTY === true;
  },
  write(chunk) {
    process.stdout.write(chunk);
  },
};

function canWrite(ctx: ExtensionContext, output: NotificationOutput): boolean {
  return ctx.mode === "tui" && output.isTTY && ctx.isIdle();
}

function emitNotification(
  mode: NotificationMode,
  body: string,
  ctx: ExtensionContext,
  env: NodeJS.ProcessEnv,
  output: NotificationOutput,
): boolean {
  if (!canWrite(ctx, output)) return false;

  const protocol = resolveProtocol(mode, env);
  if (protocol === "off") return false;

  output.write(encodeNotification(protocol, NOTIFICATION_TITLE, body));
  return true;
}

export function registerOscNotify(pi: ExtensionAPI, options: OscNotifyOptions = {}): void {
  const env = options.env ?? process.env;
  const output = options.output ?? stdout;
  const configuredMode = () => resolveConfiguredMode(
    pi.getFlag("osc-notify-protocol"),
    env.PI_OSC_NOTIFY_PROTOCOL,
  );
  const configuredContentMode = () => resolveConfiguredContentMode(
    pi.getFlag("osc-notify-content"),
    env.PI_OSC_NOTIFY_CONTENT,
  );
  let latestBody = STATIC_STATUS_BODY;

  pi.registerFlag("osc-notify-protocol", {
    description: "Terminal notification protocol: auto, bell, osc9, osc777, or off",
    type: "string",
  });
  pi.registerFlag("osc-notify-content", {
    description: "Terminal notification content: result or status",
    type: "string",
  });

  pi.on("session_start", (_event, ctx) => {
    const resolutions = [configuredMode(), configuredContentMode()];
    if (ctx.mode !== "tui") return;

    for (const resolution of resolutions) {
      if (resolution.invalidValue === undefined) continue;
      const fallback = resolution.source?.includes("content")
        ? "result"
        : "auto (OSC 777 for unknown terminals)";
      ctx.ui.notify(
        `Invalid ${resolution.source} value "${resolution.invalidValue}"; using ${fallback}.`,
        "warning",
      );
    }
  });

  pi.on("agent_start", () => {
    latestBody = STATIC_STATUS_BODY;
  });

  pi.on("message_end", event => {
    if (event.message.role !== "assistant") return;
    latestBody = createNotificationBody(event.message);
  });

  pi.on("agent_settled", (_event, ctx) => {
    const body = configuredContentMode().mode === "result" ? latestBody : STATIC_STATUS_BODY;
    emitNotification(configuredMode().mode, body, ctx, env, output);
  });

  pi.registerCommand("osc-notify-test", {
    description: "Test terminal notification: [auto|bell|osc9|osc777]",
    handler: async (args, ctx) => {
      const argument = args.trim().toLowerCase();
      let mode: NotificationMode;

      if (!argument) {
        mode = configuredMode().mode;
        if (mode === "off") {
          ctx.ui.notify("OSC notifications are disabled; specify a protocol to test.", "warning");
          return;
        }
      } else if (COMMAND_MODES.has(argument as NotificationMode)) {
        mode = argument as NotificationMode;
      } else {
        ctx.ui.notify("Usage: /osc-notify-test [auto|bell|osc9|osc777]", "warning");
        return;
      }

      if (!emitNotification(mode, TEST_NOTIFICATION_BODY, ctx, env, output)) {
        ctx.ui.notify("Notification test requires an idle interactive TTY.", "warning");
        return;
      }

      ctx.ui.notify(`Sent ${resolveProtocol(mode, env)} notification.`, "info");
    },
  });
}

export default function oscNotify(pi: ExtensionAPI): void {
  registerOscNotify(pi);
}
