import { Compass, TriangleAlert } from "lucide-react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { EmptyState } from "../components/primitives";
import { TopBar } from "../components/TopBar";

/** Unknown address (a mistyped or outdated link). */
export function NotFoundScreen() {
  return (
    <div className="page">
      <TopBar title="העמוד לא נמצא" />
      <EmptyState
        icon={<Compass size={34} />}
        title="הכתובת הזאת לא קיימת"
        text="ייתכן שהקישור ישן או שהוקלד לא נכון."
        action={
          <Link to="/" className="btn primary">
            לדף הבית
          </Link>
        }
      />
    </div>
  );
}

/** A screen crashed: say so plainly and offer a way out instead of a stack trace. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (notFound) return <NotFoundScreen />;
  return (
    <div className="page">
      <EmptyState
        icon={<TriangleAlert size={34} />}
        title="משהו השתבש"
        text="המסך לא נטען כצפוי. הנתונים והסל שלכם שמורים — אפשר לרענן או לחזור לדף הבית."
        action={
          <div className="btn-row">
            <button className="btn primary" onClick={() => window.location.reload()}>
              רענון
            </button>
            <a className="btn tinted" href="./#/">
              לדף הבית
            </a>
          </div>
        }
      />
    </div>
  );
}
