#!/usr/bin/env bun
/**
 * Seeded from @vinhnnn/dev-workflow templates/pipeline/ — adapt, then own it.
 * Wire as `"summary": "bun run .claude/scripts/work-summary.ts"`.
 *
 * `bun run summary` — the terminal what-just-happened block.
 * Prints: branch state · commits ahead of main · open PRs with check
 * status · the newest done.md entry · the latest session-log row.
 * Read-only, fast (~1s local + one gh call). Companion to the durable
 * versions (done.md / PR comments) for when you're just in a terminal:
 * the last step of the ship ritual, so a human glancing at the console
 * sees what happened without opening anything.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const sh = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 15_000 }).trim();
  } catch {
    return "";
  }
};

const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

console.log(bold("\n── work summary ────────────────────────────────"));

// branch + cleanliness
const branch = sh("git branch --show-current") || "(detached)";
const dirty = sh("git status --porcelain").split("\n").filter(Boolean).length;
console.log(
  `${bold("branch")}   ${branch}${dirty ? yellow(` ±${dirty} uncommitted`) : green(" clean")}`,
);

// commits ahead of origin/main
const ahead = sh("git log origin/main..HEAD --oneline");
if (ahead) {
  const lines = ahead.split("\n");
  console.log(`${bold("ahead")}    ${lines.length} commit(s) vs origin/main`);
  for (const l of lines.slice(0, 8)) console.log(`         ${dim(l)}`);
  if (lines.length > 8) console.log(dim(`         … +${lines.length - 8} more`));
} else {
  console.log(`${bold("ahead")}    ${green("in sync with origin/main")}`);
}

// open PRs + check status (one gh call)
const prsRaw = sh(
  `gh pr list --state open --json number,title,headRefName,statusCheckRollup --limit 10`,
);
if (prsRaw) {
  const prs = JSON.parse(prsRaw) as {
    number: number;
    title: string;
    headRefName: string;
    statusCheckRollup: { conclusion?: string; status?: string }[];
  }[];
  if (prs.length === 0) {
    console.log(`${bold("PRs")}      ${dim("none open")}`);
  }
  for (const pr of prs) {
    const checks = pr.statusCheckRollup ?? [];
    const failed = checks.some((c) => c.conclusion === "FAILURE");
    const pending = checks.some((c) => !c.conclusion || c.status === "IN_PROGRESS");
    const badge = failed ? red("✗ red") : pending ? yellow("◌ running") : green("✓ green");
    console.log(
      `${bold("PR")}       #${pr.number} ${badge}  ${pr.title.slice(0, 60)} ${dim(`(${pr.headRefName})`)}`,
    );
  }
}

// newest done.md entry + latest session-log row (cost telemetry)
const donePath = "__project__/tasks/done.md";
if (existsSync(donePath)) {
  const done = readFileSync(donePath, "utf8").split("\n");

  const entry = done.find((l) => /^\d{4}-\d{2}-\d{2}/.test(l));
  if (entry) {
    console.log(`${bold("shipped")}  ${entry.slice(0, 110)}${entry.length > 110 ? "…" : ""}`);
  }

  const rows = done.filter((l) => /^\| \d{4}-\d{2}-\d{2}/.test(l));
  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    const cells = lastRow.split("|").map((c) => c.trim());
    // | ended | author | session | duration | models | tokens | cost |
    console.log(
      `${bold("session")}  ${cells[2]} · ${cells[4]} · ${cells[5]} · ${green(cells[7] ?? "")}`,
    );
  }
}

console.log(bold("────────────────────────────────────────────────\n"));
