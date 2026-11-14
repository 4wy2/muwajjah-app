import { useEffect } from "react";
// Tells search engines not to index a "not found" page.
export default function NoIndex() {
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex";
    document.head.appendChild(m);
    return () => m.remove();
  }, []);
  return null;
}
