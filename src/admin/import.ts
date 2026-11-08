import Papa from "papaparse";
import { specs, sanitize } from "./specs";
import type { ContentKind, Row } from "../lib/types";
export interface Diff {
  key: string;
  id?: string;
  name: string;
  status: "new" | "changed" | "same" | "error";
  changes: { field: string; before: unknown; after: unknown }[];
  payload: Record<string, unknown>;
  error?: string;
}
export function parseImport(
  text: string,
  name: string,
  kind: ContentKind,
): Record<string, unknown>[] {
  let rows: unknown;
  if (name.toLowerCase().endsWith(".csv")) {
    const result = Papa.parse<Record<string, unknown>>(
      text.replace(/^\uFEFF/, ""),
      {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim(),
      },
    );
    if (result.errors.length)
      throw new Error("ملف CSV غير صالح: " + result.errors[0].message);
    rows = result.data;
  } else {
    const data = JSON.parse(text);
    rows = Array.isArray(data) ? data : data[kind];
  }
  if (!Array.isArray(rows) || !rows.length)
    throw new Error(
      "لا توجد سجلات لهذا النوع في الملف. استخدم قائمة JSON أو كائنًا بمفتاح " +
        kind,
    );
  if (rows.length > 2000) throw new Error("الحد الأقصى 2000 سجل لكل استيراد.");
  if (rows.some((r) => !r || typeof r !== "object" || Array.isArray(r)))
    throw new Error("صيغة السجلات غير صحيحة.");
  return rows as Record<string, unknown>[];
}
export function makeDiff(
  kind: ContentKind,
  incoming: Record<string, unknown>[],
  existing: Row[],
  universities: Row[],
): Diff[] {
  const seen = new Set<string>();
  return incoming.map((raw, index) => {
    const key = String(index);
    const name = String(
      raw.name || raw.title || raw.program_name || "سجل " + (index + 1),
    );
    try {
      const byId = raw.id ? existing.find((r) => r.id === raw.id) : undefined;
      if (raw.id && !byId)
        throw new Error(
          "معرّف السجل غير موجود ضمن البيانات المتاحة لك. احذف id فقط إذا كان السجل جديدًا.",
        );
      const natural = existing.filter((r) =>
        specs[kind].match.every(
          (k) => String(r[k] ?? "").trim() === String(raw[k] ?? "").trim(),
        ),
      );
      if (!byId && natural.length > 1)
        throw new Error("تطابق مكرر. حدّد id الصحيح.");
      const old = byId || natural[0];
      if (old?.deleted_at)
        throw new Error("السجل في السلة. استعده قبل التعديل.");
      if (old && raw.university_id && raw.university_id !== old.university_id)
        throw new Error("لا يمكن نقل السجل لجامعة أخرى.");
      const payload = sanitize(kind, old ? { ...old, ...raw } : raw, !!old);
      if (
        kind !== "universities" &&
        !universities.some(
          (u) => u.id === payload.university_id && !u.deleted_at,
        )
      )
        throw new Error("الجامعة غير متاحة ضمن صلاحياتك.");
      const unique =
        old?.id ||
        specs[kind].match.map((k) => String(payload[k] ?? "")).join("|");
      if (seen.has(unique)) throw new Error("السجل مكرر داخل الملف.");
      seen.add(unique);
      const changes = Object.entries(payload)
        .filter(
          ([k, v]) =>
            JSON.stringify(old?.[k] ?? "") !== JSON.stringify(v ?? ""),
        )
        .map(([field, after]) => ({ field, before: old?.[field], after }));
      return {
        key,
        id: old?.id,
        name,
        status: old ? (changes.length ? "changed" : "same") : "new",
        changes,
        payload,
      };
    } catch (e) {
      return {
        key,
        name,
        status: "error",
        changes: [],
        payload: {},
        error: (e as Error).message,
      };
    }
  });
}
