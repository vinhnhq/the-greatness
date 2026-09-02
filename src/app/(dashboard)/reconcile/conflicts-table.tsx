"use client";

/**
 * Open conflicts, and what we hold that Sapo has not seen.
 *
 * Base / ours / theirs shown together, because "which is right" is
 * unanswerable without knowing where both sides started — that is the whole
 * argument for storing a base rather than comparing two values.
 */

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  DivergenceRow,
  OpenConflict,
} from "@/lib/domain/reconcile/repository";
import { cn } from "@/lib/utils";

import { resolveConflict } from "./actions";

/** JSON values rendered for a person, with empty made visible. */
const show = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
};

function Side({
  label,
  value,
  muted,
}: {
  readonly label: string;
  readonly value: unknown;
  readonly muted?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={`break-words text-sm ${muted ? "text-muted-foreground" : ""}`}
      >
        {show(value)}
      </div>
    </div>
  );
}

export function ConflictsTable({
  conflicts,
  divergences,
}: {
  readonly conflicts: readonly OpenConflict[];
  readonly divergences: readonly DivergenceRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = (id: string, choice: "ours" | "theirs") => {
    setBusyId(id);
    startTransition(async () => {
      const result = await resolveConflict(id, choice);
      setBusyId(null);
      if (result.status === "error") toast.error(result.message);
      else
        toast.success(choice === "ours" ? "Kept our value." : "Took Sapo's.");
    });
  };

  return (
    <div className="flex flex-col gap-10">
      {/* The two sections mean opposite things — one needs a person, the
          other needs nobody — and until now they looked identical. The rule
          in the amber marker: colour a departure from the default, and only
          when there is one. With no conflicts the section stays grey. */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span
            aria-hidden
            className={cn(
              "h-3.5 w-0.5 rounded-full",
              conflicts.length > 0 ? "bg-warning" : "bg-border",
            )}
          />
          Needs a decision {conflicts.length > 0 && `· ${conflicts.length}`}
        </h2>

        {conflicts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is in conflict. A sync only asks when both sides changed the
            same field.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded-lg border p-4">
                <div className="mb-3 flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{c.label}</span>
                  <Badge variant="secondary">{c.field}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {c.entity}
                  </span>
                </div>

                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Side label="was" value={c.base} muted />
                  <ArrowRight
                    className="hidden size-4 shrink-0 self-center text-muted-foreground sm:block"
                    aria-hidden
                  />
                  <Side label="ours" value={c.ours} />
                  <Side label="sapo" value={c.theirs} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending && busyId === c.id}
                    onClick={() => decide(c.id, "ours")}
                  >
                    {pending && busyId === c.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )}
                    Keep ours
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending && busyId === c.id}
                    onClick={() => decide(c.id, "theirs")}
                  >
                    Take Sapo&rsquo;s
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {/* Blue: this list is about Sapo's side, and it is informational —
              the opposite default to the section above. */}
          <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-info" />
          Changed here since the last sync{" "}
          {divergences.length > 0 && `· ${divergences.length}`}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Edits this app holds that Sapo has not seen. Nothing here is a problem
          — the sync protects every one of them. This is the list a push back to
          Sapo would send.
        </p>

        {divergences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has been changed here since the last sync.
          </p>
        ) : (
          <ul className="flex flex-col">
            {divergences.map((d) => (
              <li
                key={`${d.entity}:${d.sapoId}:${d.field}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md px-2 py-2.5 hover:bg-muted/50"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {d.label}
                </span>
                <Badge variant="secondary">{d.field}</Badge>
                <span className="text-sm text-muted-foreground line-through">
                  {show(d.base)}
                </span>
                <ArrowRight
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="text-sm">{show(d.ours)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
