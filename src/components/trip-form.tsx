"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RunMode } from "@/types/itinerary";

const tripSchema = z.object({
  runMode: z.enum(["accommodation-only", "full-agent"]),
  city: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  nights: z.coerce.number().int().nonnegative(),
  pax: z.coerce.number().int().nonnegative(),
  rooms: z.coerce.number().int().nonnegative(),
  budgetAmount: z.coerce.number().nonnegative(),
  budgetMode: z.enum(["total", "nightly"]),
  budgetCurrency: z.string().min(3),
  roomType: z.string().min(2),
  propertyTypes: z.array(z.string()).min(1),
  preferences: z.array(z.string()).default([]),
  itineraryText: z.string().optional(),
});

const PROPERTY_OPTIONS = [
  { label: "Hotel", value: "hotel" },
  { label: "Airbnb", value: "airbnb" },
  { label: "Hostel", value: "hostel" },
  { label: "Serviced apartment", value: "serviced-apartment" },
];

const PREFERENCE_OPTIONS = [
  "near transport",
  "free cancellation",
  "late check-in",
  "breakfast",
  "private room",
];

export interface TripFormSubmission {
  values: z.infer<typeof tripSchema>;
  file: File | null;
}

interface TripFormProps {
  onSubmit: (payload: TripFormSubmission) => void;
  isLoading: boolean;
  mode: RunMode;
}

export function TripForm({ onSubmit, isLoading, mode }: TripFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [values, setValues] = useState({
    city: "",
    checkIn: "",
    checkOut: "",
    nights: 0,
    pax: 0,
    rooms: 0,
    budgetAmount: 0,
    budgetMode: "total" as const,
    budgetCurrency: "SGD",
    roomType: "private room",
    propertyTypes: ["hotel", "airbnb"],
    preferences: ["near transport", "free cancellation"],
    itineraryText: "",
  });

  const canSubmit = useMemo(() => {
    if (mode === "accommodation-only") {
      return Boolean(values.itineraryText.trim() || file);
    }

    return (
      values.city.trim().length > 0 &&
      values.checkIn.trim().length > 0 &&
      values.checkOut.trim().length > 0 &&
      values.nights > 0 &&
      values.pax > 0 &&
      values.rooms > 0 &&
      values.budgetAmount > 0
    );
  }, [mode, values, file]);

  const toggleProperty = (value: string) => {
    setValues((prev) => {
      const exists = prev.propertyTypes.includes(value);
      const next = exists
        ? prev.propertyTypes.filter((v) => v !== value)
        : [...prev.propertyTypes, value];
      return { ...prev, propertyTypes: next };
    });
  };

  const togglePreference = (value: string) => {
    setValues((prev) => {
      const exists = prev.preferences.includes(value);
      const next = exists
        ? prev.preferences.filter((v) => v !== value)
        : [...prev.preferences, value];
      return { ...prev, preferences: next };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = tripSchema.safeParse({ ...values, runMode: mode });
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }

    if (mode === "accommodation-only") {
      const hasItinerary = Boolean((parsed.data.itineraryText || "").trim() || file);
      if (!hasItinerary) {
        setErrors([
          "Accommodation Only requires itinerary submission. Paste text or upload PDF/DOCX.",
        ]);
        return;
      }
    }

    if (mode === "full-agent") {
      const missing: string[] = [];
      if (!parsed.data.city?.trim()) missing.push("destination city");
      if (!parsed.data.checkIn?.trim()) missing.push("check-in date");
      if (!parsed.data.checkOut?.trim()) missing.push("check-out date");
      if (!parsed.data.nights || parsed.data.nights <= 0) missing.push("nights");
      if (!parsed.data.pax || parsed.data.pax <= 0) missing.push("guests");
      if (!parsed.data.rooms || parsed.data.rooms <= 0) missing.push("rooms");
      if (!parsed.data.budgetAmount || parsed.data.budgetAmount <= 0) missing.push("budget");
      if (missing.length > 0) {
        setErrors([`Full Decision Agent requires: ${missing.join(", ")}.`]);
        return;
      }
    }

    setErrors([]);
    onSubmit({ values: parsed.data, file });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {mode === "full-agent" ? (
        <Card>
          <CardHeader>
            <CardTitle>Trip Basics (Required)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Input
              placeholder="Destination city"
              value={values.city}
              onChange={(e) => setValues((p) => ({ ...p, city: e.target.value }))}
            />
            <Input
              type="number"
              min={1}
              placeholder="Guests"
              value={values.pax}
              onChange={(e) => setValues((p) => ({ ...p, pax: Number(e.target.value || 1) }))}
            />
            <Input
              type="date"
              value={values.checkIn}
              onChange={(e) => setValues((p) => ({ ...p, checkIn: e.target.value }))}
            />
            <Input
              type="date"
              value={values.checkOut}
              onChange={(e) => setValues((p) => ({ ...p, checkOut: e.target.value }))}
            />
            <Input
              type="number"
              min={1}
              placeholder="Nights"
              value={values.nights}
              onChange={(e) => setValues((p) => ({ ...p, nights: Number(e.target.value || 1) }))}
            />
            <Input
              type="number"
              min={1}
              placeholder="Rooms"
              value={values.rooms}
              onChange={(e) => setValues((p) => ({ ...p, rooms: Number(e.target.value || 1) }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {mode === "full-agent"
          ? "Full Decision Agent uses manual structured input only in this mode."
          : "Accommodation Only accepts itinerary submission only in this mode."}
      </p>

      {mode === "full-agent" ? (
        <Card>
          <CardHeader>
            <CardTitle>Filters (Required)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                type="number"
                min={1}
                placeholder="Budget"
                value={values.budgetAmount}
                onChange={(e) =>
                  setValues((p) => ({ ...p, budgetAmount: Number(e.target.value || 0) }))
                }
              />
              <select
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                value={values.budgetMode}
                onChange={(e) =>
                  setValues((p) => ({ ...p, budgetMode: e.target.value as "total" | "nightly" }))
                }
              >
                <option value="total">Total budget</option>
                <option value="nightly">Nightly budget</option>
              </select>
              <Input
                placeholder="Currency"
                value={values.budgetCurrency}
                onChange={(e) => setValues((p) => ({ ...p, budgetCurrency: e.target.value }))}
              />
            </div>
            <Input
              placeholder="Room type (example: private room)"
              value={values.roomType}
              onChange={(e) => setValues((p) => ({ ...p, roomType: e.target.value }))}
            />

            <div>
              <p className="mb-2 text-sm font-medium">Property types</p>
              <div className="flex flex-wrap gap-2">
                {PROPERTY_OPTIONS.map((item) => {
                  const selected = values.propertyTypes.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => toggleProperty(item.value)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        selected ? "border-primary bg-primary/10" : "border-border"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Preferences</p>
              <div className="flex flex-wrap gap-2">
                {PREFERENCE_OPTIONS.map((item) => {
                  const selected = values.preferences.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => togglePreference(item)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        selected ? "border-primary bg-primary/10" : "border-border"
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {mode === "accommodation-only" ? (
        <Card>
          <CardHeader>
            <CardTitle>Itinerary Submission (Required)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Paste itinerary text here"
              className="min-h-[180px]"
              value={values.itineraryText}
              onChange={(e) => setValues((p) => ({ ...p, itineraryText: e.target.value }))}
            />
            <Input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? <p className="text-xs text-muted-foreground">Selected: {file.name}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {errors.length > 0 ? (
        <Card className="border-red-500/30">
          <CardContent className="pt-4 text-sm text-red-400">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Button type="submit" disabled={isLoading || !canSubmit} className="h-11 w-full">
        {isLoading
          ? "Starting run..."
          : mode === "full-agent"
          ? "Start Full Decision Agent"
          : "Find Accommodation Only"}
      </Button>
    </form>
  );
}
