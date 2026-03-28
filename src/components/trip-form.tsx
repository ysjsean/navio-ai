"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

interface TripFormProps {
  onSubmit: (formData: FormData) => void;
  isLoading: boolean;
}

export function TripForm({ onSubmit, isLoading }: TripFormProps) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !file) return;

    const formData = new FormData();
    if (text.trim()) formData.append("text", text.trim());
    if (file) formData.append("file", file);

    onSubmit(formData);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isValidFile(droppedFile)) {
      setFile(droppedFile);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && isValidFile(selected)) {
      setFile(selected);
    }
  };

  const isValidFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    return ext === "pdf" || ext === "docx";
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Text input */}
      <div className="space-y-2">
        <label
          htmlFor="itinerary-text"
          className="text-sm font-medium text-foreground/80"
        >
          Paste your itinerary
        </label>
        <Textarea
          id="itinerary-text"
          placeholder={`Example:\n\n3-day trip to Tokyo, June 1-4.\nDay 1: Sensoji Temple, Ueno Park\nDay 2: Shibuya Crossing, Harajuku, Meiji Shrine\nDay 3: Tsukiji Fish Market, Ginza shopping\n\nBudget: under $120/night\nNeed late check-in, near subway`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[180px] resize-none bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-colors font-mono text-sm"
          disabled={isLoading}
        />
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          or upload a file
        </span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {/* File upload */}
      <Card
        className={`border-2 border-dashed transition-all duration-300 cursor-pointer ${
          dragActive
            ? "border-primary/70 bg-primary/5 scale-[1.02]"
            : file
            ? "border-green-500/50 bg-green-500/5"
            : "border-border/50 hover:border-primary/30 hover:bg-primary/5"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            className="hidden"
            disabled={isLoading}
          />
          {file ? (
            <>
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                {file.name}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-primary/70"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                Drop your <span className="font-semibold text-foreground">.pdf</span> or{" "}
                <span className="font-semibold text-foreground">.docx</span> itinerary here
              </p>
              <p className="text-xs text-muted-foreground/60">
                or click to browse
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        id="submit-itinerary"
        type="submit"
        disabled={isLoading || (!text.trim() && !file)}
        className="w-full h-12 text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/25 transition-all duration-300 disabled:opacity-40 disabled:shadow-none"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Agent is thinking...
          </span>
        ) : (
          "Find My Best Stay →"
        )}
      </Button>
    </form>
  );
}
