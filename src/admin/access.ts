import type { Member } from "../lib/types";
export type AdminAccess = "member" | "editor" | "owner" | "partner";
// Controls UI visibility only. Database RLS remains authoritative.
export function canOpenAdminModule(
  member: Member | null | undefined,
  access: AdminAccess,
) {
  if (!member?.is_enabled) return false;
  // The partner page is only for partners; the owner manages everyone from Team.
  if (access === "partner") return !!member.is_partner && !member.is_owner;
  if (member.is_owner) return true;
  if (access === "owner") return false;
  return access !== "editor" || member.can_edit;
}
