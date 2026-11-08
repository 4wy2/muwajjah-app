import type { Member } from "../lib/types";
export type AdminAccess = "member" | "editor" | "owner";
// Controls UI visibility only. Database RLS remains authoritative.
export function canOpenAdminModule(
  member: Member | null | undefined,
  access: AdminAccess,
) {
  if (!member?.is_enabled) return false;
  if (member.is_owner) return true;
  if (access === "owner") return false;
  return access !== "editor" || member.can_edit;
}
