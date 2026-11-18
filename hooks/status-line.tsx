import { atom, read } from "claude-code";
import type { On } from "claude-code";

import type { PromptInfo, UsageSnap } from "../types";
import { shortModel } from "./format";
import { homeFolder, tildePath } from "./paths";
import { clipStart } from "./text-width";

const DROPPED_HINTS = new Set(["(shift+tab to cycle)", "← for agents"]);
const BLACK = "ansi256(16)";
const WHITE = "ansi256(231)";
const MODEL_COLOR = "ansi256(208)";
const CONTEXT_COLOR = "ansi256(45)";
const PATH_COLOR = "ansi256(207)";
const MUTED = WHITE;
const DETAIL = WHITE;
const LOW = "ansi256(46)";
const MID = "ansi256(220)";
const HIGH = "ansi256(196)";
const MID_PERCENT = 50;
const HIGH_PERCENT = 80;
const NO_EFFORT = "—";
const JOIN = " · ";
const PATH_ROOM = 36;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type Piece = { text: string; color: string | undefined };

const PAD: Piece = { text: "  ", color: undefined };

const usageAtom = atom(
  { plugin: "vane", key: "usage" } as const,
  { context: null, limits: [], tokens: null, window: null } as UsageSnap,
);
const promptInfoAtom = atom(
  { plugin: "vane", key: "promptInfo" } as const,
  { model: "", effort: null, cwd: "" } as PromptInfo,
);

export function renderStatusLine(on: On): void {
  on("ui.render", { component: "PromptHint" }, async ($, e) => {
    const [usage, info, home, nowMs] = await Promise.all([
      read($, usageAtom),
      read($, promptInfoAtom),
      Promise.all([$.env.get("USERPROFILE"), $.env.get("HOME")]).then(([profile, home]) =>
        homeFolder(profile, home),
      ),
      $.clock.now(),
    ]);
    const { Box, Text } = $.ui.resolve(e);
    const kept = keptHint(e.props.hint);

    return (
      <Box backgroundColor={BLACK}>
        {statusPieces(usage, info, home, nowMs).map((piece, index) => (
          <Text
            key={String(index)}
            bold
            color={piece.color}
            backgroundColor={BLACK}
            wrap="truncate-end"
          >
            {piece.text}
          </Text>
        ))}
        {kept === "" ? null : (
          <Text color={MUTED} backgroundColor={BLACK} wrap="truncate-end">
            {kept}
          </Text>
        )}
      </Box>
    );
  });
}

function statusPieces(
  usage: UsageSnap,
  info: PromptInfo,
  home: string | undefined,
  nowMs: number,
): Piece[] {
  return [
    contextPieces(usage),
    modelPieces(info),
    limitPieces(usage, nowMs),
    pathPieces(info, home),
  ]
    .filter((pieces) => pieces.length > 0)
    .flatMap((pieces) => [PAD, ...pieces, PAD]);
}

function contextPieces(usage: UsageSnap): Piece[] {
  if (usage.tokens === null || usage.window === null) return [];

  return [
    { text: humanize(usage.tokens), color: CONTEXT_COLOR },
    { text: ` / ${humanize(usage.window)}`, color: DETAIL },
  ];
}

function humanize(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;

  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

function modelPieces(info: PromptInfo): Piece[] {
  const name = titled(shortModel(info.model));
  if (name === "") return [];
  const effort = info.effort === null || info.effort === "" ? NO_EFFORT : info.effort;

  return [
    { text: `${name} `, color: MODEL_COLOR },
    { text: `(${effort})`, color: DETAIL },
  ];
}

function titled(name: string): string {
  return name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function limitPieces(usage: UsageSnap, nowMs: number): Piece[] {
  if (usage.limits.length === 0) return [{ text: "usage —", color: MUTED }];

  return usage.limits
    .flatMap((limit, index) => {
      const reset = resetIn(limit.resetsAt, nowMs);

      return [
        ...(index === 0 ? [] : [{ text: JOIN, color: MUTED }]),
        { text: `${Math.round(limit.percent)}%`, color: limitColor(limit.percent) },
        { text: reset === null ? "" : ` ↻ ${reset}`, color: DETAIL },
      ];
    })
    .filter((piece) => piece.text !== "");
}

function limitColor(percent: number): string {
  if (percent >= HIGH_PERCENT) return HIGH;
  if (percent >= MID_PERCENT) return MID;

  return LOW;
}

export function resetIn(resetsAt: string | undefined, nowMs: number): string | null {
  if (resetsAt === undefined) return null;
  const left = Date.parse(resetsAt) - nowMs;
  if (Number.isNaN(left) || left <= 0) return null;
  if (left >= DAY_MS) {
    return `${Math.floor(left / DAY_MS)}d${Math.floor((left % DAY_MS) / HOUR_MS)}h`;
  }
  if (left >= HOUR_MS) {
    const minutes = String(Math.floor((left % HOUR_MS) / MINUTE_MS)).padStart(2, "0");

    return `${Math.floor(left / HOUR_MS)}h${minutes}m`;
  }

  return `${Math.max(1, Math.floor(left / MINUTE_MS))}m`;
}

function pathPieces(info: PromptInfo, home: string | undefined): Piece[] {
  const path = tildePath(info.cwd, home);
  if (path === "") return [];

  return [{ text: clipStart(path, PATH_ROOM), color: PATH_COLOR }];
}

function keptHint(hint: string): string {
  return hint
    .split(JOIN)
    .filter((part) => !DROPPED_HINTS.has(part))
    .join(JOIN);
}
