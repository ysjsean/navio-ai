import { AgentEventType } from "@/types/agent";

export type StreamWriter = (
  type: AgentEventType,
  payload?: Record<string, unknown>
) => void;

export function createEventStream(
  executor: (write: StreamWriter) => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write: StreamWriter = (type, payload = {}) => {
        const body = JSON.stringify({
          type,
          timestamp: new Date().toISOString(),
          payload,
        });
        controller.enqueue(encoder.encode(`event: ${type}\n`));
        controller.enqueue(encoder.encode(`data: ${body}\n\n`));
      };

      try {
        await executor(write);
      } catch (error) {
        write("failed", {
          message: error instanceof Error ? error.message : "Unexpected error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
