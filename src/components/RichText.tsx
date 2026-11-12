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

// A paragraph's lines, read for structure: a short line ending in ":" is a
// small heading ("للسعوديين:"), and short "label: value" lines become a
// definition list ("عالميًا: ضمن الفئة 1201–1400"). Everything else is text.
type Part =
  | { head: string }
  | { kv: [string, string][] }
  | { lead: [string, string] }
  | { text: string };
const KV = /^([^:：\n]{2,32}?)\s*[:：]\s*(\S.{0,90})$/;
const kvOf = (line: string): [string, string] | null => {
  if (/https?:|www\./.test(line)) return null;
  const m = KV.exec(line);
  if (!m || m[1].trim().split(/\s+/).length > 4) return null;
  return [m[1].trim(), m[2].trim().replace(/[.。،]$/, "")];
};
export function paraParts(para: string): Part[] {
  const out: Part[] = [];
  for (const line of para.split("\n")) {
    const last = out[out.length - 1];
    if (/^[^:：]{2,40}[:：]$/.test(line)) out.push({ head: line.replace(/[:：]$/, "") });
    else if (kvOf(line)) {
      const kv = kvOf(line)!;
      // Short facts become tiles; a long explanation keeps reading as text
      // with its label in bold ("شروطه: الانتظام في الدراسة، وأن…").
      if (kv[1].length > 42 || /[،,]/.test(kv[1])) out.push({ lead: kv });
      else if (last && "kv" in last) last.kv.push(kv);
      else out.push({ kv: [kv] });
    } else if (last && "text" in last) last.text += "\n" + line;
    else out.push({ text: line });
  }
  return out;
}
function ListItem({ text }: { text: string }) {
  const kv = kvOf(text);
  return kv ? (
    <>
      <b className="li-label">{kv[0]}:</b> <Inline text={kv[1]} />
    </>
  ) : (
    <Inline text={text} />
  );
}
export function RichText({ text, className }: { text?: string | null; className?: string }) {
  const t = (text || "").trim();
  if (!t) return null;
  const blocks = parseBlocks(t);
  const body: ReactNode[] = blocks.flatMap((b, i) =>
    "list" in b
      ? [
          <ul key={i}>
            {b.list.map((x, j) => (
              <li key={j}>
                <ListItem text={x} />
              </li>
            ))}
          </ul>,
        ]
      : paraParts(b.para).map((p, j) =>
          "head" in p ? (
            <h4 className="rich-head" key={i + "-" + j}>
              {p.head}
            </h4>
          ) : "kv" in p ? (
            <dl className="kv" key={i + "-" + j}>
              {p.kv.map(([k, v], n) => (
                <div key={n}>
                  <dt>{k}</dt>
                  <dd>
                    <Inline text={v} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : "lead" in p ? (
            <p key={i + "-" + j}>
              <b className="li-label">{p.lead[0]}:</b> <Inline text={p.lead[1]} />
            </p>
          ) : (
            <p key={i + "-" + j} className="prewrap">
              <Inline text={p.text} />
            </p>
          ),
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
