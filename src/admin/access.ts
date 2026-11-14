import type { Member } from "../lib/types";
export type AdminAccess = "member" | "editor" | "owner" | "partner" | "lead";
// Controls UI visibility only. Database RLS remains authoritative.
export function canOpenAdminModule(
  member: Member | null | undefined,
  access: AdminAccess,
) {
  if (!member?.is_enabled) return false;
  // The partner page is only for partners; the owner manages everyone from Team.
  if (access === "partner") return !!member.is_partner && !member.is_owner;
  // The owner, or a partner (who sees their own team's part of it).
  if (access === "lead") return member.is_owner || !!member.is_partner;
  if (member.is_owner) return true;
  if (access === "owner") return false;
  return access !== "editor" || member.can_edit;
}
