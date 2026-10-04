import { ListPlus, ShoppingBasket } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatSize } from "../../core/services/format";
import { decodeList } from "../../core/services/share";
import { useAsync, useProviders } from "../../state/hooks";
import { useApp } from "../../state/store";
import { EmptyState, ProductThumb, SkeletonRows, toast } from "../components/primitives";
import { TopBar } from "../components/TopBar";

/** Opens a shopping list that someone shared as a link (see core/services/share.ts). */
export function SharedListScreen() {
  const { data = "" } = useParams();
  const navigate = useNavigate();
  const { catalog } = useProviders();
  const addToBasket = useApp((s) => s.addToBasket);
  const lines = decodeList(decodeURIComponent(data));

  const items = useAsync(async () => {
    const found = await Promise.all(
      lines.map(async (l) => ({ quantity: l.quantity, barcode: l.barcode, product: await catalog.getByBarcode(l.barcode).catch(() => null) })),
    );
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, data]);

  const known = (items.data ?? []).filter((i) => i.product);
  const unknown = (items.data ?? []).length - known.length;

  const addAll = () => {
    for (const i of known) {
      catalog.remember(i.product!);
      addToBasket(i.product!, i.quantity);
    }
    toast(`${known.length} מוצרים נוספו לסל`);
    navigate("/basket", { replace: true });
  };

  if (!lines.length) {
    return (
      <div className="page">
        <TopBar title="רשימה משותפת" />
        <EmptyState icon={<ShoppingBasket size={34} />} title="הקישור לא תקין" text="לא הצלחנו לקרוא רשימה מהקישור הזה." action={<Link to="/" className="btn tinted">לדף הבית</Link>} />
      </div>
    );
  }

  return (
    <div className="page">
      <TopBar title="רשימה משותפת" />
      <h1 className="large-title">רשימה ששיתפו איתך</h1>
      <p className="subtitle">{lines.length} מוצרים · זה עותק של הרשימה — שינויים אצלך לא ישפיעו על מי ששלח</p>

      {items.loading ? (
        <SkeletonRows count={Math.min(lines.length, 6)} />
      ) : (
        <>
          <div className="list">
            {known.map((i) => (
              <Link className="row" key={i.barcode} to={`/product/${encodeURIComponent(i.product!.id)}`}>
                <ProductThumb product={i.product!} />
                <div className="row-main">
                  <div className="row-title">{i.product!.name}</div>
                  <div className="row-sub">{[i.product!.brand, formatSize(i.product!.size)].filter(Boolean).join(" · ")}</div>
                </div>
                <span className="num" style={{ fontWeight: 700 }}>×{i.quantity}</span>
              </Link>
            ))}
          </div>
          {unknown > 0 && <p className="small muted">{unknown} מוצרים מהרשימה לא נמצאו במאגר ולא יתווספו.</p>}
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={addAll} disabled={!known.length}>
              <ListPlus size={18} /> הוספת הכל לסל שלי
            </button>
          </div>
        </>
      )}
    </div>
  );
}
