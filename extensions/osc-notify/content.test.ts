import { describe, expect, it } from "vitest";
import {
  createNotificationBody,
  resolveConfiguredContentMode,
  STATIC_STATUS_BODY,
} from "./content.ts";

const message = (
  stopReason: string,
  content: Array<{ type: string; text?: string; [key: string]: unknown }>,
  errorMessage?: string,
) => ({ stopReason, content, errorMessage });

describe("final response notification content", () => {
  it("turns assistant text into a compact plain-text excerpt", () => {
    const body = createNotificationBody(message("stop", [
      { type: "thinking", thinking: "private reasoning" },
      { type: "text", text: "# 完成\n\n- 已修复 [通知问题](https://example.com/a/very/long/target)。\n\n```ts\nconst secret = true;\n```" },
      { type: "toolCall", name: "write", arguments: { secret: true } },
    ]));

    expect(body).toBe("完成 已修复 通知问题。");
    expect(body).not.toContain("private reasoning");
    expect(body).not.toContain("example.com");
    expect(body).not.toContain("secret");
  });

  it("bounds the excerpt to 160 Unicode code points and appends an ellipsis", () => {
    const body = createNotificationBody(message("stop", [
      { type: "text", text: "😀".repeat(200) },
    ]));

    expect(Array.from(body)).toHaveLength(160);
    expect(body.endsWith("…")).toBe(true);
  });

  it.each([
    ["length", "回复已截断，请返回 Pi 查看"],
    ["aborted", "运行已停止"],
    ["error", "运行失败，请返回 Pi 查看"],
    ["toolUse", STATIC_STATUS_BODY],
  ])("uses a safe outcome for %s", (stopReason, expected) => {
    expect(createNotificationBody(message(stopReason, []))).toBe(expected);
  });

  it("uses a static fallback when the completed response has no usable text", () => {
    expect(createNotificationBody(message("stop", [
      { type: "thinking", thinking: "hidden" },
      { type: "text", text: "```sh\necho hidden\n```" },
    ]))).toBe(STATIC_STATUS_BODY);
  });
});

describe("content mode configuration", () => {
  it("defaults to result and gives CLI configuration precedence", () => {
    expect(resolveConfiguredContentMode(undefined, undefined)).toEqual({ mode: "result" });
    expect(resolveConfiguredContentMode("status", "result")).toEqual({ mode: "status" });
    expect(resolveConfiguredContentMode(undefined, "status")).toEqual({ mode: "status" });
  });

  it("falls back to result for invalid selected configuration", () => {
    expect(resolveConfiguredContentMode("secret", "status")).toEqual({
      mode: "result",
      invalidValue: "secret",
      source: "--osc-notify-content",
    });
    expect(resolveConfiguredContentMode(undefined, "secret")).toEqual({
      mode: "result",
      invalidValue: "secret",
      source: "PI_OSC_NOTIFY_CONTENT",
    });
  });
});
