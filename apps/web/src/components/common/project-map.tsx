// Leaflet + OpenStreetMap (plan §11.2). Markers are coloured by status; tapping one opens a
// popup with budget/progress and a link to the project page.
import type { Project } from "@namma-seva/api-client";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { ArrowRight, LocateFixed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { e6, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Amount } from "./bits";
import { STATUS_COLOR, StatusBadge } from "./status-badge";

export const BENGALURU: [number, number] = [12.9716, 77.5946];

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function FitBounds({ points, userLocation }: { points: [number, number][]; userLocation?: [number, number] | null }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (userLocation) {
      map.setView(userLocation, 14);
      return;
    }
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points as LatLngBoundsExpression, { padding: [36, 36], maxZoom: 15 });
  }, [key, userLocation?.[0], userLocation?.[1]]);
  return null;
}

export function ProjectMap({
  projects,
  className,
  selectedId,
  locate = false,
}: {
  projects: Project[];
  className?: string;
  selectedId?: number;
  /** Show a "near me" button that centres on the browser's location. */
  locate?: boolean;
}) {
  const { t } = useTranslation();
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const points = useMemo(() => projects.map((p) => [e6(p.latE6), e6(p.lngE6)] as [number, number]), [projects]);

  return (
    <div className={cn("relative isolate overflow-hidden rounded-xl border", className ?? "h-[420px]")}>
      <MapContainer center={BENGALURU} zoom={12} scrollWheelZoom={false} className="size-full" attributionControl>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <FitBounds points={points} userLocation={userLocation} />
        {userLocation && (
          <CircleMarker center={userLocation} radius={8} pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 3 }}>
            <Tooltip>{t("citizen.nearMe")}</Tooltip>
          </CircleMarker>
        )}
        {projects.map((p) => {
          const color = STATUS_COLOR[p.status] ?? "#6b7280";
          const selected = p.id === selectedId;
          return (
            <CircleMarker
              key={p.id}
              center={[e6(p.latE6), e6(p.lngE6)]}
              radius={selected ? 13 : 10}
              pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.95 }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {p.title ?? `#${p.id}`}
              </Tooltip>
              <Popup minWidth={240}>
                <div className="flex flex-col gap-2 font-sans">
                  <StatusBadge status={p.status} />
                  <p className="m-0! text-sm leading-snug font-semibold">{p.title ?? `${t("common.project")} #${p.id}`}</p>
                  <p className="text-muted-foreground m-0! text-xs">
                    {t(`categories.${p.category}`)} · {t("common.ward")} {p.wardId}
                  </p>
                  <div className="flex justify-between text-xs">
                    <span>{t("common.budget")}</span>
                    <Amount value={p.budget} compact className="font-medium" />
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div className="bg-primary h-full" style={{ width: `${percent(p.spent, p.budget)}%` }} />
                  </div>
                  <p className="text-muted-foreground m-0! text-xs">{t("projects.budgetUsed", { pct: percent(p.spent, p.budget) })}</p>
                  <Link href={`/projects/${p.id}`} className="text-primary inline-flex items-center gap-1 text-xs font-semibold">
                    {t("common.view")} <ArrowRight className="size-3" />
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {locate && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute top-3 right-3 z-[500] shadow"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition(
              (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
              () => undefined,
              { enableHighAccuracy: true, timeout: 8000 },
            )
          }
        >
          <LocateFixed /> {t("citizen.nearMe")}
        </Button>
      )}
      <Legend />
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="bg-background/90 absolute bottom-6 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-md border px-2 py-1.5 text-[11px] shadow-sm backdrop-blur">
      {["PENDING_APPROVAL", "ACTIVE", "PAUSED", "COMPLETED"].map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[s] }} />
          {t(`status.${s}`)}
        </span>
      ))}
    </div>
  );
}

/** Site vs proof location, with the distance line — for auditors. */
export function GpsDiffMap({ site, proof, className }: { site: [number, number]; proof: [number, number] | null; className?: string }) {
  const { t } = useTranslation();
  const points = proof ? [site, proof] : [site];
  return (
    <div className={cn("relative isolate overflow-hidden rounded-lg border", className ?? "h-56")}>
      <MapContainer center={site} zoom={16} scrollWheelZoom={false} className="size-full">
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <FitBounds points={points} />
        <CircleMarker center={site} radius={10} pathOptions={{ color: "#fff", weight: 2, fillColor: "#c2410c", fillOpacity: 0.95 }}>
          <Tooltip permanent direction="top">{t("projects.site")}</Tooltip>
        </CircleMarker>
        {proof && (
          <>
            <Polyline positions={[site, proof] as LatLngExpression[]} pathOptions={{ color: "#2563eb", dashArray: "6 6" }} />
            <CircleMarker center={proof} radius={8} pathOptions={{ color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 0.95 }}>
              <Tooltip permanent direction="bottom">{t("projects.proofGps")}</Tooltip>
            </CircleMarker>
          </>
        )}
      </MapContainer>
    </div>
  );
}

/** Tap-to-place marker for the create-project form. */
export function LocationPicker({ value, onChange, className }: { value: [number, number] | null; onChange: (v: [number, number]) => void; className?: string }) {
  function Clicks() {
    const map = useMap();
    useMapEvents({ click: (e) => onChange([e.latlng.lat, e.latlng.lng]) });
    // Fly to the pin when it is set from outside (address search); taps keep the current zoom.
    useEffect(() => {
      if (value) map.flyTo(value, Math.max(map.getZoom(), 16));
    }, [value?.[0], value?.[1]]);
    return null;
  }
  return (
    <div className={cn("relative isolate overflow-hidden rounded-lg border", className ?? "h-56")}>
      <MapContainer center={value ?? BENGALURU} zoom={value ? 15 : 12} scrollWheelZoom className="size-full cursor-crosshair">
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <Clicks />
        {value && <CircleMarker center={value} radius={10} pathOptions={{ color: "#fff", weight: 2, fillColor: "#c2410c", fillOpacity: 0.95 }} />}
      </MapContainer>
    </div>
  );
}
