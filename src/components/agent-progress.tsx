"use client";

import { AgentEvent } from "@/types/agent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AgentProgressProps {
  events: AgentEvent[];
  currentStage?: string;
  currentSite?: string;
  currentAction?: string;
}

export function AgentProgress({
  events,
  currentStage,
  currentSite,
  currentAction,
}: AgentProgressProps) {
  const visible = events.slice(-30).reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Agent Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-xs md:grid-cols-3">
          <p>
            <span className="font-semibold">Stage:</span> {currentStage || "waiting"}
          </p>
          <p>
            <span className="font-semibold">Site:</span> {currentSite || "-"}
          </p>
          <p>
            <span className="font-semibold">Action:</span> {currentAction || "-"}
          </p>
        </div>

        <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
          {visible.map((event, idx) => (
            <div key={`${event.timestamp}-${idx}`} className="rounded-lg border p-3 text-xs">
              <p className="font-semibold">{event.type}</p>
              <p className="text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</p>
              {event.payload.site ? <p>Site: {String(event.payload.site)}</p> : null}
              {event.payload.action ? <p>Action: {String(event.payload.action)}</p> : null}
              {event.payload.message ? <p>Info: {String(event.payload.message)}</p> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
