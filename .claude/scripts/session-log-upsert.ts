#!/usr/bin/env bun
/**
 * Seeded from @vinhnnn/dev-workflow templates/pipeline/ — adapt, then own it.
 *
 * SessionEnd hook — summarize the finished session (duration, models,
 * tokens, est. cost) and upsert it as a "Session log" row in TWO places:
 * a `## Session log` section at the bottom of __project__/tasks/done.md
 * (the repo's canonical archive — survives machines, visible to
 * collaborators, readable without trawling PR threads), and, when the
 * branch has a PR, the same table as a persistent PR comment. One row per
 * session (a session ending twice replaces its row); a cumulative line
 * answers "total cost till now".
 *
 * SESSION_LOG_DRY_RUN=1 → print the would-be table, write/post nothing.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";

const MARKER = "<!-- claude-session-log -->";

/** The SessionEnd payload Claude Code writes to this hook's stdin. */
type HookPayload = {
  transcript_path?: string;
  cwd?: string;
  session_id?: string;
};

/**
 * One JSONL line of a transcript. Every field is optional on purpose: these
 * are append-only logs written by a moving target, and a shape change must
 * degrade to "skip this line", never to a crash inside a SessionEnd hook.
 */
type TranscriptEntry = {
  type?: string;
  timestamp?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
};

// $/MTok: [input, output]; cache read = 0.1×in, cache write = 1.25×in.
// Current pick 2026-07 — re-check when the vendor's price list moves.
const PRICING: [RegExp, [number, number]][] = [
  [/fable|mythos/, [10, 50]],
  [/opus/, [5, 25]],
  [/sonnet/, [3, 15]],
  [/haiku/, [1, 5]],
];

const priceFor = (model: string): [number, number] =>
  PRICING.find(([re]) => re.test(model))?.[1] ?? [3, 15];

type Agg = { inp: number; out: number; cr: number; cw: number };

// readFileSync(0) rather than Bun.stdin: identical behaviour under bun and
// node, so the script needs no Bun global and therefore no @types/bun in
// whatever project adopts it — the types would have to coexist with that
// project's own, and this reads one small JSON payload.
const input = JSON.parse(readFileSync(0, "utf8")) as HookPayload;
const transcript: string = input.transcript_path ?? "";
const cwd: string = input.cwd ?? process.cwd();
const fullSessionId: string = input.session_id ?? "unknown";
const sessionId: string = fullSessionId.slice(0, 8);
if (!transcript || !existsSync(transcript)) process.exit(0);

// Subagent transcripts (QA/reviewer/research agents) live OUTSIDE the main
// transcript, under the session's tmp dir: tasks/<agentId>.output, same
// JSONL shape. Include them or the logged cost understates every session
// that spawned an agent — which, with the ship ritual, is most of them.
// `/tmp`, not `/private/tmp`: macOS resolves the former to the latter via
// symlink, while on Linux `/private` does not exist at all — hardcoding it
// there makes this silently find nothing, i.e. the exact undercount the
// subagent scan exists to prevent. Not os.tmpdir(): on macOS that returns
// /var/folders/…, which is a different directory.
const agentDir = `/tmp/claude-${process.getuid?.() ?? ""}/${cwd.replace(/[/.]/g, "-")}/${fullSessionId}/tasks`;
const agentFiles = existsSync(agentDir)
  ? readdirSync(agentDir)
      .filter((f) => f.endsWith(".output"))
      .map((f) => `${agentDir}/${f}`)
  : [];

// ---- aggregate transcripts (streamed — transcripts can be huge) ----
const perModel = new Map<string, Agg>();
let first = "";
let last = "";
let agentCount = 0;

const scan = async (path: string, isMain: boolean): Promise<boolean> => {
  let contributed = false;
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) {
    let e: TranscriptEntry;
    try {
      e = JSON.parse(line) as TranscriptEntry;
    } catch {
      continue;
    }
    // Wall-clock comes from the main transcript only — agents run inside
    // its span, so folding their timestamps in would not change duration
    // but would let a stray agent clock skew it.
    if (isMain && e.timestamp) {
      if (!first) first = e.timestamp;
      last = e.timestamp;
    }
    const u = e.message?.usage;
    const model = e.message?.model;
    if (e.type !== "assistant" || !u || !model || model === "<synthetic>") continue;
    const agg = perModel.get(model) ?? { inp: 0, out: 0, cr: 0, cw: 0 };
    agg.inp += u.input_tokens ?? 0;
    agg.out += u.output_tokens ?? 0;
    agg.cr += u.cache_read_input_tokens ?? 0;
    agg.cw += u.cache_creation_input_tokens ?? 0;
    perModel.set(model, agg);
    contributed = true;
  }
  return contributed;
};

await scan(transcript, true);
for (const f of agentFiles) {
  try {
    if (await scan(f, false)) agentCount++;
  } catch {}
}
if (perModel.size === 0) process.exit(0);

let cost = 0;
let tin = 0;
let tout = 0;
let tcr = 0;
for (const [model, a] of perModel) {
  const [pin, pout] = priceFor(model);
  cost += (a.inp * pin + a.out * pout + a.cr * pin * 0.1 + a.cw * pin * 1.25) / 1e6;
  tin += a.inp + a.cw;
  tout += a.out;
  tcr += a.cr;
}

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;
const durMs = first && last ? +new Date(last) - +new Date(first) : 0;
const dur = `${Math.floor(durMs / 3.6e6)}h ${String(Math.floor((durMs % 3.6e6) / 6e4)).padStart(2, "0")}m`;
const models =
  [...perModel.keys()].map((m) => m.replace(/^claude-/, "")).join(", ") +
  (agentCount > 0 ? ` (+${agentCount} agents)` : "");
const ended = new Date().toISOString().slice(0, 16).replace("T", " ");

// ---- find the PR ----
const gh = (...args: string[]) => spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 30_000 });

// Attribute the row to whoever ran the session (team setting: every
// member's local agent writes to the same tables). Markdown-hostile
// characters are stripped — the name lands inside a table cell.
const rawAuthor =
  spawnSync("git", ["config", "user.name"], { cwd, encoding: "utf8" }).stdout?.trim() ||
  process.env.USER ||
  "unknown";
const author = rawAuthor.replace(/[|`\\\n]/g, "").slice(0, 24);

const row = `| ${ended} | ${author} | \`${sessionId}\` | ${dur} | ${models} | ${fmt(tin)}/${fmt(tout)}/${fmt(tcr)} | $${cost.toFixed(2)} |`;

const prView = gh("pr", "view", "--json", "number");
const pr: number | null =
  prView.status === 0 ? (JSON.parse(prView.stdout) as { number: number }).number : null;

const header = [
  MARKER,
  "### 🤖 Session log",
  "",
  "| ended (UTC) | author | session | duration | models | tokens in/out/cache-read | est. cost |",
  "|---|---|---|---|---|---|---|",
].join("\n");

// Cost of a data row = the last "$<number>" cell. Tolerant of a formatter's
// column padding (trailing spaces before the closing pipe).
const costOf = (rowLine: string): number => {
  const m = rowLine.match(/\$([0-9][0-9.]*)\s*\|\s*$/);
  return m ? parseFloat(m[1]) : 0;
};

/**
 * Rebuild the whole marker→cumulative section from existing text, upserting
 * `row`. Self-healing: only genuine data rows are carried over — header,
 * divider, cumulative lines (even if a markdown formatter wrapped one in
 * table pipes), and this session's prior row are all dropped and regenerated.
 * The cumulative line is separated from the table by a BLANK line so the
 * repo's formatter can't absorb it back into the table as a phantom row.
 *
 * Both properties are load-bearing: a hook that runs unattended at the end
 * of every session has to repair its own output, because by definition
 * nobody is watching it write.
 */
const upsertTable = (existingBody: string | null): string => {
  const rows = (existingBody ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.startsWith("| ") &&
        !l.includes("---") &&
        !l.includes("ended (UTC)") &&
        !l.includes("Cumulative"),
    )
    .filter((l) => !l.includes(`\`${sessionId}\``))
    .concat(row);
  const total = rows.reduce((s, r) => s + costOf(r), 0);
  return [
    header,
    ...rows,
    "",
    `**Cumulative est. cost: $${total.toFixed(2)}** _(API-rate estimate; subscription-billed)_`,
  ].join("\n");
};

// ---- always: upsert into done.md's Session log section ----
const doneFile = `${cwd}/__project__/tasks/done.md`;
const logTarget = existsSync(doneFile) ? doneFile : `${cwd}/.claude/session-log.md`;
if (!process.env.SESSION_LOG_DRY_RUN) {
  const existing = existsSync(logTarget) ? readFileSync(logTarget, "utf8") : "";
  const start = existing.indexOf(MARKER);
  if (start === -1) {
    appendFileSync(
      logTarget,
      `\n---\n\n## Session log (auto — SessionEnd hook)\n\n${upsertTable(null)}\n`,
    );
  } else {
    // Section runs from the marker to the next top-level heading (or EOF).
    // Rebuilding the whole span self-heals any prior corruption.
    const nextH2 = existing.indexOf("\n## ", start + MARKER.length);
    const end = nextH2 === -1 ? existing.length : nextH2;
    const rebuilt = existing.slice(0, start) + upsertTable(existing.slice(start, end));
    writeFileSync(logTarget, rebuilt + (existing.slice(end) || "\n"));
  }
}

if (!pr) {
  if (process.env.SESSION_LOG_DRY_RUN) console.log(upsertTable(null));
  process.exit(0);
}

// ---- upsert the PR comment ----
const repoInfo = gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner");
const nameWithOwner = repoInfo.stdout.trim();
const comments = gh(
  "api",
  `repos/${nameWithOwner}/issues/${pr}/comments`,
  "--jq",
  `[.[] | select(.body | startswith("${MARKER}"))][0] | {id, body}`,
);
const existing = comments.stdout.trim()
  ? (JSON.parse(comments.stdout) as { id: number; body: string } | null)
  : null;

const body = upsertTable(existing?.body ?? null);

if (process.env.SESSION_LOG_DRY_RUN) {
  console.log(body);
  process.exit(0);
}

if (existing?.id) {
  gh(
    "api",
    "-X",
    "PATCH",
    `repos/${nameWithOwner}/issues/comments/${existing.id}`,
    "-f",
    `body=${body}`,
  );
} else {
  gh("pr", "comment", String(pr), "--body", body);
}
