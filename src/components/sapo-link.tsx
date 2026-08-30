/**
 * "Open in Sapo" — the one click from a row here to the row that owns it.
 *
 * Deliberately a plain anchor rather than a button: it leaves the app, and a
 * middle-click or a cmd-click should open a tab like any other link. It is
 * also `target="_blank"`, because the operator is reading here and editing
 * there — sending them away and back would lose their place in a list they
 * had scrolled and filtered.
 *
 * `rel="noreferrer"` alongside `noopener`: the destination is our own Sapo
 * admin, but the pair is the habit worth keeping uniform rather than
 * reasoning about per link.
 *
 * Renders nothing when there is no url, which is the normal case for a
 * product created in this app.
 */

import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

export function SapoLink({
  url,
  label = "Open in Sapo",
  className,
}: {
  readonly url: string | null;
  readonly label?: string;
  readonly className?: string;
}) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground",
        "underline-offset-4 transition-colors hover:text-foreground hover:underline",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {label}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}
