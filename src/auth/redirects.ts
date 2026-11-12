export type Portal = "student" | "admin";
export function safeReturnTo(value: string | null, portal: Portal) {
  const fallback =
    portal === "admin" ? "/admin/universities" : "/";
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, "https://muwajjah.local");
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://muwajjah.local" ||
      path.startsWith("//") ||
      /[\\\u0000-\u0020]/.test(path)
    )
      return fallback;
    if (/^\/(auth|admin\/(login|signup|forgot|reset|callback))(\/|$)/.test(path))
      return fallback;
    if (portal === "admin" && path !== "/admin" && !path.startsWith("/admin/"))
      return fallback;
    return value;
  } catch {
    return fallback;
  }
}
