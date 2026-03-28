export type AgentEventType =
  | "parsing_started"
  | "parsing_done"
  | "area_selected"
  | "tinyfish_started"
  | "site_searching"
  | "listing_extracted"
  | "ranking_started"
  | "ranking_done"
  | "completed"
  | "failed"
  | "tinyfish_progress";

export interface AgentEventPayload {
  stage?: string;
  site?: string;
  action?: string;
  message?: string;
  runId?: string;
  streaming_url?: string;
  [key: string]: unknown;
}

export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  payload: AgentEventPayload;
}
