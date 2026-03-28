"use client";

import { memo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LiveBrowserProps {
  streamingUrl?: string;
}

// memo ensures parent SSE-event re-renders don't touch this component unless
// streamingUrl itself actually changes to a different value.
export const LiveBrowser = memo(function LiveBrowser({ streamingUrl }: LiveBrowserProps) {
  const [activeUrl, setActiveUrl] = useState<string | undefined>(undefined);
  const [latestUrl, setLatestUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!streamingUrl) return;
    setLatestUrl((prev) => (prev === streamingUrl ? prev : streamingUrl));
    // Pin the first live session URL to avoid iframe remount flashing.
    setActiveUrl((prev) => prev || streamingUrl);
  }, [streamingUrl]);

  useEffect(() => {
    // Reset between runs when upstream clears the URL.
    if (!streamingUrl) {
      setActiveUrl(undefined);
      setLatestUrl(undefined);
    }
  }, [streamingUrl]);

  const handleFrameError = () => {
    // If current URL expires, jump to the newest emitted URL once.
    if (latestUrl && latestUrl !== activeUrl) {
      setActiveUrl(latestUrl);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Browser Session</CardTitle>
      </CardHeader>
      <CardContent>
        {activeUrl ? (
          <iframe
            src={activeUrl}
            title="TinyFish live browser"
            className="h-[500px] w-full rounded-lg border"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
            onError={handleFrameError}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Waiting for live browser session…
          </p>
        )}
      </CardContent>
    </Card>
  );
});
