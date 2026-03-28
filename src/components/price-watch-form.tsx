"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AgentResult } from "@/types/itinerary";

interface Props {
  result: AgentResult;
}

type WatchState = "idle" | "loading" | "success" | "error";

export function PriceWatchForm({ result }: Props) {
  const [chatId, setChatId] = useState("");
  const [state, setState] = useState<WatchState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId.trim()) return;

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chatId.trim(),
          area: result.bestArea,
          dates: result.dates,
          budget: result.budget,
          bestOverall: result.bestOverall,
          cheapestAcceptable: result.cheapestAcceptable,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to set watch");
      }

      setState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  };

  return (
    <Card className="bg-gradient-to-br from-card to-card/50 border-border/40">
      <CardContent className="p-6">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
          <svg
            className="w-4 h-4 text-cyan-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          Watch prices
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Get a Telegram message when prices drop for{" "}
          <span className="text-foreground font-medium">{result.bestArea}</span>.
        </p>

        {state === "success" ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Watch set! Check Telegram for confirmation.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Your Telegram Chat ID
              </label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="e.g. 123456789"
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border/60 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 placeholder:text-muted-foreground/40 transition-colors"
              />
              <p className="text-xs text-muted-foreground/60">
                Message{" "}
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  @userinfobot
                </a>{" "}
                on Telegram to get your chat ID.
              </p>
            </div>

            {state === "error" && (
              <p className="text-xs text-red-400">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={state === "loading" || !chatId.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {state === "loading" ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Setting watch...
                </>
              ) : (
                "Notify me on Telegram"
              )}
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
