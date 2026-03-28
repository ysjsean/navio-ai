"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TripForm, TripFormSubmission } from "@/components/trip-form";
import { RunMode } from "@/types/itinerary";
import { Card, CardContent } from "@/components/ui/card";

export default function SearchPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<RunMode>("full-agent");
  const [showLivePreview, setShowLivePreview] = useState(false);

  const handleSubmit = async ({ values, file }: TripFormSubmission) => {
    setIsLoading(true);
    const runId = crypto.randomUUID();

    const payload = {
      values,
      mode,
      showLivePreview,
      file: file
        ? {
            name: file.name,
            type: file.type,
            dataUrl: await fileToDataUrl(file),
          }
        : null,
    };

    sessionStorage.setItem(`navio-pending-${runId}`, JSON.stringify(payload));
    router.push(
      `/run?runId=${encodeURIComponent(runId)}&preview=${showLivePreview ? "1" : "0"}`,
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-semibold">Choose Your Workflow</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Both workflows start with itinerary submission. The difference is execution depth.
      </p>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("full-agent")}
          className="cursor-pointer text-left"
        >
          <Card
            className={
              mode === "full-agent"
                ? "border-primary bg-primary/10 ring-2 ring-primary/40 transition"
                : "border-border hover:border-primary/50 hover:bg-muted/20 transition"
            }
          >
            <CardContent className="space-y-2 pt-4">
              <p className="text-lg font-semibold">Full Decision Agent (No Itinerary)</p>
              <p className="text-sm text-muted-foreground">
                Structured-form flow. You enter city, dates, guests, rooms, budget and preferences directly.
              </p>
              <p className="text-xs font-medium text-primary">
                {mode === "full-agent" ? "Selected" : "Click to select"}
              </p>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setMode("accommodation-only")}
          className="cursor-pointer text-left"
        >
          <Card
            className={
              mode === "accommodation-only"
                ? "border-primary bg-primary/10 ring-2 ring-primary/40 transition"
                : "border-border hover:border-primary/50 hover:bg-muted/20 transition"
            }
          >
            <CardContent className="space-y-2 pt-4">
              <p className="text-lg font-semibold">Accommodation Only (Itinerary Only)</p>
              <p className="text-sm text-muted-foreground">
                Paste or upload itinerary only. The agent extracts trip details and returns accommodation options quickly.
              </p>
              <p className="text-xs font-medium text-primary">
                {mode === "accommodation-only" ? "Selected" : "Click to select"}
              </p>
            </CardContent>
          </Card>
        </button>
      </div>

      <TripForm
        onSubmit={handleSubmit}
        isLoading={isLoading}
        mode={mode}
        showLivePreview={showLivePreview}
        onShowLivePreviewChange={setShowLivePreview}
      />
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
