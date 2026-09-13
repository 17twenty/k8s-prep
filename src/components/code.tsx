import { cn } from "cn";
import { Check, Copy, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  highlight,
  isShell,
  looksLikeDiagram,
  promptLines,
  type Token,
} from "@/lib/highlight";
import { copyText } from "@/lib/clipboard";

const tokenClass: Record<Token["kind"], string> = {
  plain: "",
  cmd: "font-[650] text-ink",
  flag: "text-[var(--tok-flag)]",
  str: "text-[var(--tok-str)]",
  var: "text-[var(--tok-var)]",
  num: "text-[var(--tok-var)]",
  cmt: "text-ink-3 italic",
  key: "font-[650] text-[var(--tok-flag)]",
  punct: "text-ink-3",
};

function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(value);
        setState(ok ? "copied" : "failed");
        setTimeout(() => setState("idle"), ok ? 1600 : 2600);
      }}
      aria-label={
        state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy failed \u2014 select the text manually"
            : "Copy to clipboard"
      }
      className={cn(
        "absolute top-2 right-2 z-20 inline-flex size-7 items-center justify-center border transition-all select-none",
        // Visible at rest. An invisible 28px target cannot be hit on touch, and
        // aiming for it and missing double-clicks the code underneath instead.
        state === "copied"
          ? "border-signal bg-signal text-ink"
          : state === "failed"
            ? "border-destructive bg-sheet text-destructive"
            : "border-rule bg-sheet text-ink-3 opacity-60 group-hover/code:opacity-100 hover:border-ink hover:text-ink focus-visible:opacity-100",
      )}
    >
      {state === "copied" ? (
        <Check className="size-3.5" strokeWidth={3} />
      ) : state === "failed" ? (
        <X className="size-3.5" strokeWidth={2.5} />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

/** A shell transcript: ink on paper, inverting the usual glowing terminal. */
export function ShellBlock({ code }: { code: string }) {
  const lines = highlight(code, "bash");
  const prompts = promptLines(code);

  return (
    <div className="group/code relative my-7 border border-ink/15 bg-sheet">
      <CopyButton value={code.replace(/\n$/, "")} />
      <Fold lines={lines.length}>
        <pre
          className="mono overflow-x-auto px-4 py-4 text-[0.8125rem] leading-[1.85] sm:px-5"
          style={{ tabSize: 2 }}
        >
          <code>
            {lines.map((tokens, i) => (
              <span key={i} className="block">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mr-2.5 inline-block w-2 shrink-0 select-none",
                    prompts[i] ? "text-kilo" : "text-transparent",
                  )}
                >
                  $
                </span>
                {tokens.map((token, j) => (
                  <span key={j} className={tokenClass[token.kind]}>
                    {token.text}
                  </span>
                ))}
              </span>
            ))}
          </code>
        </pre>
      </Fold>
    </div>
  );
}

/**
 * Long listings — the Go controller is 203 lines — are folded by default so
 * they do not bury the prose explaining them. Short ones are never folded.
 */
const FOLD_OVER = 40;

function Fold({ lines, children }: { lines: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (lines <= FOLD_OVER) return <>{children}</>;

  return (
    <div>
      {/* The clipping and the fade belong to the code, the control does not —
          position the button in flow or it sits on top of the last lines. */}
      <div className="relative">
        <div className={cn(!open && "max-h-[28rem] overflow-hidden")}>
          {children}
        </div>
        {!open && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-sheet to-transparent"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="type-label block w-full border-t border-rule bg-sheet py-2.5 text-ink-2 transition-colors hover:bg-paper hover:text-ink"
      >
        {open ? "Collapse" : `Show all ${lines} lines`}
      </button>
    </div>
  );
}

/** A manifest or a listing. Line numbers because you will be told to edit one. */
export function ManifestBlock({
  code,
  lang,
  numbered = true,
}: {
  code: string;
  lang: string;
  numbered?: boolean;
}) {
  const lines = highlight(code, lang);
  const gutter = String(lines.length).length;

  return (
    <div className="group/code relative my-7 border border-ink/15 bg-sheet">
      <CopyButton value={code.replace(/\n$/, "")} />
      <div className="type-label absolute top-0 left-0 z-10 border-r border-b border-rule bg-paper px-2.5 py-1.5 text-ink-3">
        {lang}
      </div>
      <Fold lines={lines.length}>
        <pre
          className="mono overflow-x-auto px-4 pt-10 pb-4 text-[0.8125rem] leading-[1.8] sm:px-5"
          style={{ tabSize: 2 }}
        >
          <code>
            {lines.map((tokens, i) => (
              <span key={i} className="block">
                {numbered && (
                  <span
                    aria-hidden="true"
                    className="mr-4 inline-block shrink-0 text-right text-ink-3/60 select-none tabular-nums"
                    style={{ width: `${gutter}ch` }}
                  >
                    {i + 1}
                  </span>
                )}
                {tokens.map((token, j) => (
                  <span key={j} className={tokenClass[token.kind]}>
                    {token.text}
                  </span>
                ))}
              </span>
            ))}
          </code>
        </pre>
      </Fold>
    </div>
  );
}

/**
 * The ASCII diagrams are the best thing in this cookbook, so they get treated
 * as figures — plate-mounted on chart paper — rather than quoted as output.
 */
export function FigureBlock({ code }: { code: string }) {
  return (
    <figure className="chart-grid-fine my-8 overflow-x-auto border border-rule bg-paper/60 px-5 py-6">
      <pre className="mono mx-auto w-fit text-[0.75rem] leading-[1.6] text-ink">
        <code>{code.replace(/\n$/, "")}</code>
      </pre>
    </figure>
  );
}

/** Expected output. Quiet, unactionable, clearly not something you type. */
export function OutputBlock({ code }: { code: string }) {
  return (
    <div className="my-7 border-l-2 border-rule bg-sheet/60 py-3 pr-4 pl-4">
      <pre className="mono overflow-x-auto text-[0.78125rem] leading-[1.75] text-ink-2">
        <code>{code.replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
}

/** Listings you read and edit, as opposed to commands you run. */
const LISTINGS = new Set([
  "yaml",
  "go",
  "json",
  "html",
  "dockerfile",
  "toml",
  "ini",
]);

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  // line numbers would fight a diff's own +/- line markers
  if (lang === "diff" || lang === "patch")
    return <ManifestBlock code={code} lang={lang} numbered={false} />;
  if (LISTINGS.has(lang)) return <ManifestBlock code={code} lang={lang} />;
  if (isShell(lang)) return <ShellBlock code={code} />;
  if (looksLikeDiagram(code)) return <FigureBlock code={code} />;
  return <OutputBlock code={code} />;
}
