"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Place } from "@/types/places";

// Leaflet must be loaded client-side only
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);
const Circle = dynamic(
  () => import("react-leaflet").then((m) => m.Circle),
  { ssr: false }
);

interface Props {
  area: string;
  city?: string;
  hotelNames?: string[];
}

type LoadState = "idle" | "loading" | "done" | "error";

const TYPE_COLORS: Record<Place["type"], string> = {
  food: "#f97316",       // orange
  cafe: "#a78bfa",       // violet
  attraction: "#34d399", // green
  hotel: "#60a5fa",      // blue
};

const TYPE_LABELS: Record<Place["type"], string> = {
  food: "Restaurant / Bar",
  cafe: "Cafe",
  attraction: "Attraction",
  hotel: "Hotel",
};

function LeafletIcons() {
  // Inject leaflet CSS once
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = "leaflet-css";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
  }, []);
  return null;
}

export function AreaMap({ area, city = "", hotelNames = [] }: Props) {
  const [state, setState] = useState<LoadState>("idle");
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);

  const load = async () => {
    setState("loading");
    try {
      const res = await fetch(
        `/api/places?area=${encodeURIComponent(area)}&city=${encodeURIComponent(city)}`
      );
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setCenter([data.lat, data.lng]);
      setPlaces(data.places);
      setState("done");
    } catch {
      setState("error");
    }
  };

  const foodPlaces = places.filter((p) => p.type === "food" || p.type === "cafe");
  const attractions = places.filter((p) => p.type === "attraction");

  if (state === "idle") {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <p className="text-sm text-muted-foreground">
          See food, cafes, and attractions near <span className="text-foreground font-medium">{area}</span>
        </p>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Load map
        </button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-muted-foreground">
        <svg className="w-4 h-4 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading map...
      </div>
    );
  }

  if (state === "error" || !center) {
    return (
      <p className="text-sm text-red-400 py-6 text-center">
        Could not load map for this area.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <LeafletIcons />

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(TYPE_LABELS) as [Place["type"], string][]).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[type] }}
            />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-border/40 h-72">
        <MapContainer
          center={center}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Area radius */}
          <Circle
            center={center}
            radius={800}
            pathOptions={{ color: "#7c3aed", fillColor: "#7c3aed", fillOpacity: 0.05, weight: 1.5, dashArray: "4" }}
          />

          {/* Places */}
          {places.map((place, i) => (
            <Marker key={i} position={[place.lat, place.lng]}>
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">{place.name}</p>
                  <p style={{ color: TYPE_COLORS[place.type] }}>{TYPE_LABELS[place.type]}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Summary counts */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span><span className="text-orange-400 font-medium">{foodPlaces.length}</span> food &amp; cafes</span>
        <span><span className="text-emerald-400 font-medium">{attractions.length}</span> attractions</span>
        <span className="ml-auto">within 800m of {area}</span>
      </div>
    </div>
  );
}
