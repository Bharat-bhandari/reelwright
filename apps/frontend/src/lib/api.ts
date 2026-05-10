// ─── Config ──────────────────────────────────────────────────────────────────
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8084";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrapeData {
  logo_url?: string | null;
  brand_name?: string | null;
  product_images: string[];
  copy_blocks: string[];
  dominant_colors: string[];
  source_url: string;
}

export interface ShotPlan {
  index: number;
  description: string;
  duration_seconds: number;
  image_prompt: string;
  motion_prompt?: string;
}

export interface VideoPlan {
  hook: string;
  shots: ShotPlan[];
  voiceover_script: string;
  voiceover_tone?: string;
  music_feel?: string;
}

export type ShotStatus =
  | "pending"
  | "generating_image"
  | "generating_video"
  | "critiquing"
  | "regenerating"
  | "done"
  | "failed";

export interface ShotState {
  index: number;
  description: string;
  image_url?: string | null;
  video_url?: string | null;
  status: ShotStatus;
  critique?: string | null;
  retry_count: number;
}

export type MessageType =
  | "scrape"
  | "plan"
  | "generate"
  | "critique"
  | "regenerate"
  | "assemble"
  | "done"
  | "error";

export interface StatusMessage {
  timestamp: string;
  type: MessageType;
  message: string;
}

export interface AgentStateSnapshot {
  thread_id: string;
  next: string[];
  state: {
    url: string;
    scrape?: ScrapeData | null;
    plan?: VideoPlan | null;
    shots?: ShotState[];
    voiceover_url?: string | null;
    final_video_url?: string | null;
    status_messages?: StatusMessage[];
    user_directions?: string[];
    error?: string | null;
  };
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  service: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Agent routes ─────────────────────────────────────────────────────────────

/** POST /agent/run — starts a new agent run, returns immediately */
export async function runAgent(
  url: string,
): Promise<{ thread_id: string; status: string }> {
  return apiFetch("/agent/run", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/** GET /agent/state/{thread_id} */
export async function getState(
  threadId: string,
): Promise<AgentStateSnapshot> {
  return apiFetch(`/agent/state/${threadId}`);
}

/** POST /agent/resume/{thread_id} — resumes from current interrupt */
export async function resumeAgent(
  threadId: string,
  patch?: Record<string, unknown>,
): Promise<{ thread_id: string; status: string }> {
  return apiFetch(`/agent/resume/${threadId}`, {
    method: "POST",
    body: JSON.stringify(patch ? { patch } : {}),
  });
}

/** POST /agent/direct/{thread_id} — synchronous plan revision via LLM */
export async function directAgent(
  threadId: string,
  direction: string,
): Promise<{ plan: VideoPlan; status_messages: StatusMessage[] }> {
  return apiFetch(`/agent/direct/${threadId}`, {
    method: "POST",
    body: JSON.stringify({ direction }),
  });
}

// ─── SSE stream ───────────────────────────────────────────────────────────────

/**
 * Parse a raw SSE data string which may be JSON or Python repr.
 *
 * The backend uses `jsonable_encoder` so data should be JSON. However in
 * practice the Python dict serialiser sometimes emits single-quoted strings
 * (when the value itself contains double-quotes). Rather than a naive global
 * quote-swap (which breaks on nested dicts in message strings), we:
 *   1. Try JSON.parse first (handles the normal case).
 *   2. Fall back to a regex extractor for the two known shapes:
 *        • StatusMessage: { timestamp, type, message }
 *        • Complete:      { final_video_url }
 *        • Error:         { error }
 */
function parseSSEData(raw: string): Record<string, unknown> | null {
  // Fast path: valid JSON
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch { /* fall through */ }

  // Robust Python-repr extractor for known field shapes.
  // We extract each field value by grabbing everything between the key's
  // opening quote and the next unescaped closing quote before a ,/} boundary.
  function extractField(src: string, key: string): string | null {
    // Match: 'key': 'value'  OR  "key": "value"
    const re = new RegExp(`['"]${key}['"]\\s*:\\s*['"]([\\s\\S]*?)['"](?=[,}])`, "");
    const m = src.match(re);
    return m ? m[1] : null;
  }

  const obj: Record<string, unknown> = {};
  for (const key of ["timestamp", "type", "message", "error", "final_video_url"]) {
    const val = extractField(raw, key);
    if (val !== null) obj[key] = val;
  }

  return Object.keys(obj).length > 0 ? obj : null;
}


export interface StreamHandlers {
  onStatus: (msg: StatusMessage) => void;
  onComplete: (data: { final_video_url: string }) => void;
  onError: (err: Error) => void;
}

/**
 * Open an SSE stream for a thread. Returns an unsubscribe function.
 * Call unsubscribe() to close the connection.
 */
export function streamAgent(
  threadId: string,
  handlers: StreamHandlers,
): () => void {
  const es = new EventSource(`${API_BASE}/agent/stream/${threadId}`);

  es.addEventListener("status", (e: MessageEvent<string>) => {
    const data = parseSSEData(e.data);
    if (data) handlers.onStatus(data as unknown as StatusMessage);
  });

  es.addEventListener("complete", (e: MessageEvent<string>) => {
    const data = parseSSEData(e.data);
    if (data) handlers.onComplete(data as { final_video_url: string });
    es.close();
  });

  es.addEventListener("error", (e: MessageEvent<string>) => {
    const data = parseSSEData(e.data);
    if (data?.error) {
      handlers.onError(new Error(data.error as string));
    }
    // Also fires when the server closes the connection (normal end)
    es.close();
  });

  // Native EventSource error (network issues, server down, etc.)
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) return; // already closed
    handlers.onError(new Error("SSE connection error"));
    es.close();
  };

  return () => es.close();
}
