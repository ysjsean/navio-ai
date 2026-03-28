import { NextRequest, NextResponse } from "next/server";
import type { Place } from "@/types/places";

export interface PlacesResponse {
  lat: number;
  lng: number;
  places: Place[];
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "navio-ai/1.0" },
  });
  const data = await res.json();
  if (!data[0]) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function fetchNearbyPlaces(lat: number, lng: number): Promise<Place[]> {
  const radius = 800; // metres
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"~"restaurant|cafe|fast_food|bar"](around:${radius},${lat},${lng});
      node["tourism"~"attraction|museum|viewpoint"](around:${radius},${lat},${lng});
    );
    out body 30;
  `;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });

  const data = await res.json();

  return (data.elements ?? [])
    .filter((el: any) => el.lat && el.lon && el.tags?.name)
    .map((el: any): Place => {
      const amenity: string = el.tags?.amenity ?? "";
      const tourism: string = el.tags?.tourism ?? "";
      let type: Place["type"] = "attraction";
      if (amenity === "cafe") type = "cafe";
      else if (amenity === "restaurant" || amenity === "fast_food" || amenity === "bar") type = "food";
      else if (tourism) type = "attraction";
      return {
        name: el.tags.name,
        type,
        lat: el.lat,
        lng: el.lon,
      };
    });
}

export async function GET(req: NextRequest) {
  const area = req.nextUrl.searchParams.get("area");
  const city = req.nextUrl.searchParams.get("city") ?? "";

  if (!area) {
    return NextResponse.json({ error: "area is required" }, { status: 400 });
  }

  try {
    const coords = await geocode(`${area}, ${city}`);
    if (!coords) {
      return NextResponse.json({ error: "Could not geocode area" }, { status: 404 });
    }

    const places = await fetchNearbyPlaces(coords.lat, coords.lng);

    return NextResponse.json({ lat: coords.lat, lng: coords.lng, places });
  } catch (err) {
    console.error("Places API error:", err);
    return NextResponse.json({ error: "Failed to fetch places" }, { status: 500 });
  }
}
