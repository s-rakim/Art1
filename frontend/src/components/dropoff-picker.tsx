"use client";
import { useMemo } from "react";
import type { LatLng } from "@/lib/types";
import { DeliveryMap, type MapPin } from "./delivery-map";

/**
 * Checkout's drop-off pin. Tap the map to drop it, drag it to fine-tune, or use the device's
 * location. The pin only travels with this order; nothing is kept on the device.
 */
export function DropoffPicker({
  value,
  onChange,
  onLocate,
  locating,
}: {
  value: LatLng | null;
  onChange: (p: LatLng | null) => void;
  onLocate: () => void;
  locating: boolean;
}) {
  const pins = useMemo<MapPin[]>(() => (value ? [{ id: "dropoff", kind: "dropoff", label: "Your drop-off point", lat: value.lat, lng: value.lng, draggable: true }] : []), [value]);
  return (
    <div className="sm:col-span-2">
      <p className="label">Drop-off point on the map</p>
      <p className="mb-2 text-[13px] text-maxcontrast">Tap the map where the rider should hand over your parcel, then drag the pin to the exact door if you need to.</p>
      <DeliveryMap pins={pins} onPick={onChange} follow={value ? "dropoff" : undefined} className="h-[260px] sm:h-[300px]" trails={false} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary btn-sm" disabled={locating} onClick={onLocate}>{locating ? "Finding you…" : "Use my location"}</button>
        {value ? (
          <>
            <span className="chip chip-success">Pin set</span>
            <span className="tabular-nums text-[12px]">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>
            <button type="button" className="text-[13px] underline" onClick={() => onChange(null)}>Remove pin</button>
          </>
        ) : (
          <span className="text-[12px] text-maxcontrast">Optional, but it helps the rider find you.</span>
        )}
      </div>
    </div>
  );
}
