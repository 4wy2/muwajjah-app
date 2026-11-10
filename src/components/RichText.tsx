import { Fragment, type ReactNode } from "react";

// Renders guide text stored as plain lines: "-", "•", "*" or "1." lines become
// real lists; links, e-mails, phone numbers and @handles become tappable and
// keep their left-to-right direction inside Arabic text.
const BULLET = /^\s*(?:[-•*▪●]|\d{1,2}[.)-])\s+/;
const TOKEN =
  /(https?:\/\/[^\s<>()]+[^\s<>().,،؛:!?]|www\.[^\s<>()]+[^\s<>().,،؛:!?]|[\w.+-]+@[\w-]+\.[\w.-]*\w|@[A-Za-z0-9_.]{2,}\w|(?:\+?966|0)5\d{8}|\b(?:800|920)\d{6,7}\b|\b199\d{3}\b)/g;

function linkFor(tok: string): string | null {
  if (/^https?:\/\//.test(tok)) return tok;
  if (/^www\./.test(tok)) return "https://" + tok;
  if (/^[\w.+-]+@[\w-]+\./.test(tok)) return "mailto:" + tok;
  if (/^@/.test(tok)) return null;
  return "tel:" + tok.replace(/^0(?=5)/, "+966");
}

export function Inline({ text }: { text: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        const href = linkFor(p);
        const external = !!href && href.startsWith("http");
        return href ? (
          <a
            key={i}
            href={href}
            dir="ltr"
            className="inline-link"
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {p.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        ) : (
          <bdi key={i} dir="ltr">
            {p}
          </bdi>
        );
      })}
    </>
  );
}

export function parseBlocks(text: string): ({ list: string[] } | { para: string })[] {
  const out: ({ list: string[] } | { para: string })[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      out.push({ para: "" });
      continue;
    }
    const last = out[out.length - 1];
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "");
      if (last && "list" in last) last.list.push(item);
      else out.push({ list: [item] });
    } else if (last && "para" in last && last.para) {
      last.para += "\n" + line;
    } else {
      out.push({ para: line });
    }
  }
  return out.filter((b) => !("para" in b) || b.para);
}

export function RichText({ text, className }: { text?: string | null; className?: string }) {
  const t = (text || "").trim();
  if (!t) return null;
  const blocks = parseBlocks(t);
  const body: ReactNode[] = blocks.map((b, i) =>
    "list" in b ? (
      <ul key={i}>
        {b.list.map((x, j) => (
          <li key={j}>
            <Inline text={x} />
          </li>
        ))}
      </ul>
    ) : (
      <p key={i} className="prewrap">
        <Inline text={b.para} />
      </p>
    ),
  );
  return <div className={"rich" + (className ? " " + className : "")}>{body}</div>;
}

// Used to avoid printing the same housing text twice (summary + section).
export const sameText = (a: string, b: string) => {
  const n = (s: string) => s.replace(/[\s\-•*.,،:؛]+/g, "").trim();
  const x = n(a);
  const y = n(b);
  return !!x && !!y && (y.includes(x) || x.includes(y));
};
