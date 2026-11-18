import { describe, expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";

import { displayWidth } from "../hooks/text-width";

type Piece = { text: string; color: string | undefined; bold: boolean | undefined };
type Limit = { kind: string; percentUsed: number; resetsInMs?: number };
type WorldOptions = {
  tokens?: number;
  window?: number;
  cwd?: string;
  model?: string;
  limits?: Limit[];
};

const NOW = 1_800_000_000_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const HOME = "/Users/dev";
const PROJECT = `${HOME}/W/Projects/releezy`;
const MODEL = "claude-opus-5-5";
const ENGINE_HINT = "(shift+tab to cycle) · ← for agents";
const MODEL_COLOR = "ansi256(208)";
const CONTEXT = "ansi256(45)";
const PATH = "ansi256(207)";
const DETAIL = "ansi256(231)";
const LOW = "ansi256(46)";
const MID = "ansi256(220)";
const HIGH = "ansi256(196)";
const MUTED = "ansi256(231)";
const PAD = { text: "  ", color: undefined, bold: true };
const PATH_CELLS = 36;
const SESSION_START = { cwd: PROJECT, surface: "terminal", isInteractive: true } as const;

describe("the status line", () => {
  test("SL1 the cycle hint is removed and the rest of the engine hint stays", async ($, on) => {
    await worldOf($, on);

    const drawn = await piecesOf($, "(shift+tab to cycle) · esc to interrupt");

    expect(drawn.at(-1)).toEqual({ text: "esc to interrupt", color: MUTED, bold: undefined });
    expect(drawn.map((piece) => piece.text).join("")).not.toContain("shift+tab");
  });

  test("SL2 each field splits into an accent value and a muted detail, all bold", async ($, on) => {
    await worldOf($, on, {
      tokens: 155_100,
      window: 1_000_000,
      limits: [{ kind: "five_hour", percentUsed: 2, resetsInMs: 3 * HOUR_MS + 5 * MINUTE_MS }],
    });
    await effortStop($, "high");

    expect(await piecesOf($)).toEqual([
      PAD,
      context("155.1k"),
      detail(" / 1.00M"),
      PAD,
      PAD,
      model("Opus 5.5 "),
      detail("(high)"),
      PAD,
      PAD,
      limit("2%", LOW),
      detail(" ↻ 3h05m"),
      PAD,
      PAD,
      path("~/W/Projects/releezy"),
      PAD,
    ]);
  });

  test("SL3 no limits shows a single muted usage —", async ($, on) => {
    await worldOf($, on, { limits: [] });

    const drawn = await piecesOf($);

    expect(drawn.filter((piece) => piece.text === "usage —")).toEqual([quiet("usage —")]);
  });

  test("SL4 token counts are humanized at the boundaries", async ($, on) => {
    await worldOf($, on);

    await measureUsage($, { tokens: 999, window: 1_000 });
    expect(await piecesOf($)).toEqual(expect.arrayContaining([context("999"), detail(" / 1.0k")]));

    await measureUsage($, { tokens: 1_000, window: 999_999 });
    expect(await piecesOf($)).toEqual(
      expect.arrayContaining([context("1.0k"), detail(" / 1000.0k")]),
    );

    await measureUsage($, { tokens: 1_000_000, window: 1_000_000 });
    expect(await piecesOf($)).toEqual(expect.arrayContaining([context("1.00M"), detail(" / 1.00M")]));
  });

  test("SL5 a reset shows the largest unit", async ($, on) => {
    await worldOf($, on);
    const resetPiece = async (resetsInMs: number) => {
      await measureUsage($, { limits: [{ kind: "five_hour", percentUsed: 10, resetsInMs }] });
      return piecesOf($);
    };

    expect(await resetPiece(2 * DAY_MS + 3 * HOUR_MS)).toContainEqual(detail(" ↻ 2d3h"));
    expect(await resetPiece(3 * HOUR_MS + 5 * MINUTE_MS)).toContainEqual(detail(" ↻ 3h05m"));
    expect(await resetPiece(45 * MINUTE_MS)).toContainEqual(detail(" ↻ 45m"));
  });

  test("SL6 a long directory is cut to an ellipsis and its last 35 characters", async ($, on) => {
    const tail = "a/very/long/path/that/never/fits/in/the/status/line";
    await worldOf($, on, { cwd: `${HOME}/${tail}` });

    const shown = `~/${tail}`;

    expect(await piecesOf($)).toContainEqual(path(`…${shown.slice(-35)}`));
  });

  test("SL9 a directory of wide characters is cut by display cells, not by string length", async ($, on) => {
    await worldOf($, on, { cwd: `${HOME}/${"日".repeat(30)}` });

    const shown = pathPiece(await piecesOf($));

    expect(displayWidth(shown)).toBeLessThanOrEqual(PATH_CELLS);
    expect(shown.startsWith("…日")).toBe(true);
  });

  test("SL10 a directory of combining accents is not cut while it fits in the cells", async ($, on) => {
    const decomposed = "e\u0301".repeat(30);
    await worldOf($, on, { cwd: `${HOME}/${decomposed}` });

    expect(pathPiece(await piecesOf($))).toBe(`~/${decomposed}`);
  });

  test("SL11 a dated model name drops the prefix and the date", async ($, on) => {
    await worldOf($, on, { model: "claude-haiku-4-5-20251001" });

    expect(await piecesOf($)).toContainEqual(model("Haiku 4.5 "));
  });

  test("SL12 a directory that merely starts like home keeps its full path", async ($, on) => {
    await worldOf($, on, { cwd: "/Users/devops/app" });

    expect(await piecesOf($)).toContainEqual(path("/Users/devops/app"));
  });

  test("SL13 switching the model updates the model shown", async ($, on) => {
    await worldOf($, on);

    await $.classic.PostModelSwitch(modelSwitch(MODEL, "claude-haiku-4-5"));

    expect(await piecesOf($)).toContainEqual(model("Haiku 4.5 "));
  });

  test("SL14 a subagent stopping does not overwrite the main chat effort", async ($, on) => {
    await worldOf($, on);
    await effortStop($, "high");

    await $.classic.Stop({
      stop_hook_active: false,
      effort: { level: "low" },
      agent_id: "agent-1",
    });

    expect(await piecesOf($)).toContainEqual(detail("(high)"));
  });

  test("SL15 a limit with no reset time shows the percent and no time", async ($, on) => {
    await worldOf($, on, { limits: [{ kind: "five_hour", percentUsed: 48 }] });

    const drawn = await piecesOf($);

    expect(drawn).toContainEqual(limit("48%", LOW));
    expect(drawn.map((piece) => piece.text).join("")).not.toContain("↻");
  });

  test("SL17 a limit percent turns warning from 50 and error from 80", async ($, on) => {
    await worldOf($, on);
    const percentPiece = async (percentUsed: number) => {
      await measureUsage($, { limits: [{ kind: "five_hour", percentUsed }] });
      return piecesOf($);
    };

    expect(await percentPiece(49)).toContainEqual(limit("49%", LOW));
    expect(await percentPiece(50)).toContainEqual(limit("50%", MID));
    expect(await percentPiece(79)).toContainEqual(limit("79%", MID));
    expect(await percentPiece(80)).toContainEqual(limit("80%", HIGH));
  });

  test("SL16 a turn ending keeps the measured figures instead of the stale ones", async ($, on) => {
    await worldOf($, on, { tokens: 10_000, window: 200_000 });
    await measureUsage($, { tokens: 42_000, window: 200_000 });

    await $.turn.start({ text: "go", turnId: "t1" });
    await $.turn.complete({
      answer: "",
      durationMs: 1,
      isAborted: false,
      turnId: "t1",
      reason: "answer",
    });

    const text = (await piecesOf($)).map((piece) => piece.text).join("");
    expect(text).toContain("42.0k");
    expect(text).not.toContain("10.0k");
  });

  test("SL7 unknown tokens drop the token part and keep the model and directory", async ($, on) => {
    await worldOf($, on, {});

    expect(await piecesOf($)).toEqual([
      PAD,
      model("Opus 5.5 "),
      detail("(—)"),
      PAD,
      PAD,
      quiet("usage —"),
      PAD,
      PAD,
      path("~/W/Projects/releezy"),
      PAD,
    ]);
  });

  test("SL8 the for-agents hint is dropped and nothing is left over", async ($, on) => {
    await worldOf($, on);

    const drawn = await piecesOf($, "← for agents");

    expect(drawn.map((piece) => piece.text).join("")).not.toContain("for agents");
    expect(drawn.at(-1)).toEqual(PAD);
  });
});

async function worldOf($: Engine, on: On, options: WorldOptions = {}): Promise<void> {
  mock.clock(on, { now: NOW });
  mock.env(on, { HOME });
  const cwd = options.cwd ?? PROJECT;
  const context =
    options.tokens === undefined || options.window === undefined
      ? {}
      : { tokens: options.tokens, window: options.window };
  const rateLimits = rateLimitsOf(options.limits ?? []);

  on("session.model", () => ({ value: options.model ?? MODEL }));
  on("session.cwd", () => ({ value: cwd }));
  on("session.usage", () => ({ value: { startedAt: 0, context, rateLimits } }) as never);
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("turn.start", (_$, e) => ({ turnId: e.turnId }));
  on("turn.complete", (_$, e) => ({ text: e.answer }));
  on("classic.Stop", () => ({}));
  on("config.list", () => ({ value: [{ key: "theme", value: "dark" }] }) as never);
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("command.register", () => ({ value: {} }) as never);
  on("classic.SessionStart", () => ({}));
  on("classic.UserPromptSubmit", () => ({}));
  on("classic.PostModelSwitch", () => ({}));
  on("classic.CwdChanged", () => ({}));
  on("classic.PostToolUse", () => ({}));

  await $.session.start(SESSION_START);
}

function rateLimitsOf(limits: Limit[]) {
  return limits.map(({ kind, percentUsed, resetsInMs }) => ({
    kind,
    percentUsed,
    ...(resetsInMs === undefined ? {} : { resetsAt: new Date(NOW + resetsInMs).toISOString() }),
  }));
}

async function measureUsage(
  $: Engine,
  reading: { tokens?: number; window?: number; limits?: Limit[] },
): Promise<void> {
  await $.session.measure({
    context: { tokens: reading.tokens, window: reading.window ?? 200_000 },
    rateLimits: rateLimitsOf(reading.limits ?? []),
    changed: ["context", "rateLimits"],
  });
}

async function effortStop($: Engine, level: string): Promise<void> {
  await $.classic.Stop({ stop_hook_active: false, effort: { level } });
}

function pathPiece(pieces: Piece[]): string {
  return pieces.filter((piece) => piece.color === PATH).at(-1)?.text ?? "";
}

function modelSwitch(
  from: string,
  to: string,
): Parameters<Engine["classic"]["PostModelSwitch"]>[0] {
  return {
    from_model: from,
    to_model: to,
    requested_model: to,
    source: "command",
    context_tokens: 0,
    prompt_cache_warm: false,
    cache_ttl: "5m",
    estimated_cache_write_usd: 0,
    pricing: "catalog",
  };
}

function styled(text: string, color: string): Piece {
  return { text, color, bold: true };
}

const context = (text: string) => styled(text, CONTEXT);
const model = (text: string) => styled(text, MODEL_COLOR);
const path = (text: string) => styled(text, PATH);
const detail = (text: string) => styled(text, DETAIL);
const quiet = (text: string) => styled(text, MUTED);
const limit = (text: string, color: string) => styled(text, color);

async function piecesOf($: Engine, hint = ENGINE_HINT): Promise<Piece[]> {
  const mounted = await $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "PromptHint",
    props: { isDraft: false, isWorking: false, hint },
  });
  const { children = [] } = (await mounted.drawn()) as { children?: DrawnText[] };
  return children.map((child) => ({
    text: shownText(child),
    color: child.props?.color,
    bold: child.props?.bold,
  }));
}

type DrawnText = { props?: { color?: string; bold?: boolean }; children?: unknown[] };

function shownText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(shownText).join("");
  const children = (node as { children?: unknown[] } | undefined)?.children ?? [];
  return children.map(shownText).join("");
}
