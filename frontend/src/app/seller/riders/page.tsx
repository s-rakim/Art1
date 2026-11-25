"use client";
import { useEffect, useMemo } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { DeliveryMap, type MapPin } from "@/components/delivery-map";
import { LiveDot } from "@/components/live-refresh";
import { RidersList } from "@/components/riders-list";
import { api } from "@/lib/api";
import { useLiveReload } from "@/lib/live";
import { useApi } from "@/lib/use-api";

export default function SellerRiders() {
  const { data, error, reload } = useApi((t) => api.sellerRiders(t));
  const live = useLiveReload(["job", "order"], reload, 0);
  // Positions move all the time, so keep refreshing even while the socket is up.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  const riders = data ?? [];
  const onShift = riders.filter((r) => r.on_shift);
  const nearest = onShift.find((r) => r.distance_km != null);
  const pins = useMemo<MapPin[]>(
    () =>
      (data ?? []).flatMap((r) =>
        r.on_shift && r.position
          ? [{ id: r.id, kind: r.active_deliveries > 0 ? "rider" : "idle", label: r.full_name, lat: r.position.lat, lng: r.position.lng, heading: r.position.heading }]
          : [],
      ),
    [data],
  );

  return (
    <>
      <PageTitle
        title="Riders"
        kicker={`${onShift.length} on shift${nearest ? ` · nearest is ${nearest.full_name.split(" ")[0]}, ${nearest.distance_km!.toFixed(1)} km away` : ""}`}
        action={<LiveDot live={live} />}
      />
      <p className="mb-4 max-w-2xl text-[14px] text-maxcontrast">
        Riders on shift near your shop, nearest first, plus anyone carrying one of your orders. New orders go to the nearest free rider unless you pick someone else when you dispatch.
      </p>
      <ErrorLine error={error} />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <DeliveryMap pins={pins} className="h-[360px] xl:h-[560px]" />
        <div className="xl:max-h-[560px] xl:overflow-y-auto">
          <RidersList riders={riders} showDistance empty="No riders on shift near your shop right now." />
        </div>
      </div>
    </>
  );
}
