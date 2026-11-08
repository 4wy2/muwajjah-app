import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { usePreferences } from "../lib/store";

export function Appearance() {
  const theme = usePreferences((state) => state.theme);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return null;
}

export function ThemeToggle() {
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  return (
    <button
      className="icon-btn"
      aria-label="تبديل الوضع الليلي"
      onClick={() =>
        setTheme(
          document.documentElement.dataset.theme === "dark" ? "light" : "dark",
        )
      }
    >
      {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
