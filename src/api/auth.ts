import { appUrl } from "../lib/config";
import { db } from "./client";
export async function signIn(email: string, password: string) {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUpStudent(
  email: string,
  password: string,
  name: string,
) {
  const { error } = await db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: appUrl("/auth/callback"),
      data: { guide_student_name: name, guide_account_kind: "student" },
    },
  });
  if (error) throw error;
}
// A contributor request is only a flag on the auth user. It grants nothing:
// the owner must approve it from /admin/team (guide_set_member_details).
export async function signUpContributor(
  email: string,
  password: string,
  name: string,
) {
  const { error } = await db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: appUrl("/admin/callback"),
      data: { guide_name: name, guide_signup: true },
    },
  });
  if (error) throw error;
}
export async function sendRecovery(email: string, resetPath: string) {
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl(resetPath),
  });
  if (error) throw error;
}
export async function changePassword(password: string) {
  const { error } = await db.auth.updateUser({ password });
  if (error) throw error;
  const result = await db.auth.signOut();
  if (result.error) throw result.error;
}
export async function signInWithGoogle(callbackPath: string) {
  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: appUrl(callbackPath) },
  });
  if (error) throw error;
}
