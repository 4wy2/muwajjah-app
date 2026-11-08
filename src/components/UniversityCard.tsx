import { memo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  MapPin,
  Star,
  GitCompareArrows,
  GraduationCap,
  Building2,
} from "lucide-react";
import type { University } from "../lib/types";
import { safeUrl, friendly, housing, place } from "../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { useFavorites, useToggleFavorite } from "../api/student";
import { usePreferences } from "../lib/store";
import { useToast } from "./ui";
export function UniversityLogo({
  university,
}: {
  university: Pick<University, "logo_url" | "name">;
}) {
  const url = safeUrl(university.logo_url);
  return (
    <div className="university-logo">
      {url ? (
        <img
          src={url}
          alt={"شعار " + university.name}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <GraduationCap size={30} />
    </div>
  );
}
export function FavoriteButton({
  kind,
  id,
  label,
}: {
  kind: "university" | "program";
  id: string;
  label: string;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const q = useFavorites();
  const m = useToggleFavorite();
  const toast = useToast();
  const favorite = q.data?.find(
    (f) => f[(kind + "_id") as "university_id" | "program_id"] === id,
  );
  return (
    <button
      className={"icon-btn favorite " + (favorite ? "selected" : "")}
      aria-label={
        (favorite ? "إزالة من المفضلة: " : "إضافة إلى المفضلة: ") + label
      }
      aria-pressed={!!favorite}
      disabled={m.isPending || (!!user && q.isPending)}
      onClick={async () => {
        if (!user) {
          nav("/auth/login?next=" + encodeURIComponent(loc.pathname));
          return;
        }
        if (q.error) {
          toast(friendly(q.error), true);
          return;
        }
        try {
          await m.mutateAsync({ kind, id, existing: favorite });
          toast(
            favorite ? "تمت الإزالة من المفضلة" : "تمت الإضافة إلى المفضلة",
          );
        } catch (e) {
          toast(friendly(e), true);
        }
      }}
    >
      <Star size={19} fill={favorite ? "currentColor" : "none"} />
    </button>
  );
}
const UniversityCard = memo(function UniversityCard({
  university: u,
  compare = true,
}: {
  university: University;
  compare?: boolean;
}) {
  const selected = usePreferences((s) => s.comparison.includes(u.id));
  const toggle = usePreferences((s) => s.toggleCompare);
  const toast = useToast();
  const where = place(u.city, u.region);
  const housingLabel = housing(u.housing_status);
  return (
    <article className="university-card">
      <div className="card-top">
        <UniversityLogo university={u} />
        <FavoriteButton kind="university" id={u.id} label={u.name} />
      </div>
      <Link className="card-title stretched" to={"/universities/" + u.id}>
        <h3>{u.name}</h3>
      </Link>
      {where && (
        <p className="card-location">
          <MapPin size={13} aria-hidden="true" />
          {where}
        </p>
      )}
      <div className="card-facts">
        {u.type && (
          <span className={"badge " + (/أهل|خاص/.test(u.type) ? "private" : "")}>
            {u.type}
          </span>
        )}
        {housingLabel && (
          <span className="fact">
            <Building2 size={13} aria-hidden="true" />
            {housingLabel}
          </span>
        )}
      </div>
      {compare && (
        <button
          className={selected ? "compare-button active" : "compare-button"}
          onClick={() => {
            if (!toggle(u.id)) toast("يمكن مقارنة 3 جامعات كحد أقصى.", true);
          }}
          aria-pressed={selected}
        >
          <GitCompareArrows size={14} />
          {selected ? "في المقارنة" : "قارن"}
        </button>
      )}
    </article>
  );
});
export default UniversityCard;
