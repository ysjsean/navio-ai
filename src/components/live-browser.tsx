"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LiveBrowserProps {
  streamingUrl?: string;
}

export function LiveBrowser({ streamingUrl }: LiveBrowserProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Browser Session</CardTitle>
      </CardHeader>
      <CardContent>
        {streamingUrl ? (
          <iframe
            src={streamingUrl}
            title="TinyFish live browser"
            className="h-[500px] w-full rounded-lg border"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Waiting for TinyFish to provide a streaming URL.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
