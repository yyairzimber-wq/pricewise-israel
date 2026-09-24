import { ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

/** iOS-style navigation bar: title fades in once the large title scrolls away. */
export function TopBar({ title, back = true, actions }: { title?: string; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
      <div className="topbar-side">
        {back && (
          <button className="icon-btn plain" onClick={goBack} aria-label="חזרה">
            <ChevronRight size={26} />
          </button>
        )}
      </div>
      <div className="topbar-title">{title}</div>
      <div className="topbar-side end">{actions}</div>
    </header>
  );
}
