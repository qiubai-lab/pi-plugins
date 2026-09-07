import { describe, expect, it } from "vitest";
import {
  encodeNotification,
  resolveConfiguredMode,
  resolveProtocol,
  sanitizeNotificationText,
} from "./protocol.ts";

describe("notification protocol encoding", () => {
  it("encodes Bell, OSC 9, and OSC 777 as exact byte sequences", () => {
    expect(encodeNotification("bell", "Pi", "Ready for input")).toBe("\x07");
    expect(encodeNotification("osc9", "Pi", "Ready for input")).toBe(
      "\x1b]9;Pi: Ready for input\x1b\\",
    );
    expect(encodeNotification("osc777", "Pi", "Ready for input")).toBe(
      "\x1b]777;notify;Pi;Ready for input\x1b\\",
    );
  });

  it("removes control and bidi characters, replaces delimiters, and bounds Unicode by code point", () => {
    const unsafe = ` A;B\x1b]9;owned\x07\n\u202e${"😀".repeat(200)} `;
    const value = sanitizeNotificationText(unsafe, 128, true);

    expect(value).not.toMatch(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069;]/u);
    expect(Array.from(value).length).toBeLessThanOrEqual(128);
    expect(value).toContain("A；B");
    expect(encodeNotification("osc777", unsafe, unsafe).match(/\x1b/g)).toHaveLength(2);
  });
});

describe("protocol resolution", () => {
  it.each([
    [{ TERM_PROGRAM: "iTerm.app" }, "osc9"],
    [{ TERM_PROGRAM: "ghostty" }, "osc9"],
    [{ TERM_PROGRAM: "WezTerm" }, "osc777"],
    [{ TERM: "rxvt-unicode-256color" }, "osc777"],
    [{ TERM_PROGRAM: "Apple_Terminal", TERM: "xterm-256color" }, "osc777"],
    [{ TERM: "xterm-256color" }, "osc777"],
    [{}, "osc777"],
  ] as const)("resolves auto environment %o to %s", (env, expected) => {
    expect(resolveProtocol("auto", env)).toBe(expected);
  });

  it.each(["bell", "osc9", "osc777", "off"] as const)(
    "keeps the explicit %s mode",
    mode => expect(resolveProtocol(mode, { TERM_PROGRAM: "iTerm.app" })).toBe(mode),
  );

  it("uses CLI over environment and treats an invalid selected value as auto", () => {
    expect(resolveConfiguredMode("bell", "osc9")).toEqual({ mode: "bell" });
    expect(resolveConfiguredMode(undefined, "osc9")).toEqual({ mode: "osc9" });
    expect(resolveConfiguredMode("invalid", "bell")).toEqual({
      mode: "auto",
      invalidValue: "invalid",
      source: "--osc-notify-protocol",
    });
    expect(resolveConfiguredMode(undefined, "invalid")).toEqual({
      mode: "auto",
      invalidValue: "invalid",
      source: "PI_OSC_NOTIFY_PROTOCOL",
    });
  });
});
