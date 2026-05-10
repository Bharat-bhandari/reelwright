"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getState, runAgent, streamAgent, type ShotState, type StatusMessage } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  scrape: "#a1a1aa", plan: "#60a5fa", generate: "#22d3ee",
  critique: "#60a5fa", regenerate: "#f59e0b", assemble: "#a1a1aa",
  done: "#4ade80", error: "#fb7185",
};
const TYPE_ICON: Record<string, string> = {
  scrape: "🔍", plan: "✏️", generate: "🎬",
  critique: "👁️", regenerate: "🔁", assemble: "🎞️",
  done: "✅", error: "⚠️",
};

// Step-based progress: map last-seen message type to a progress value
function deriveProgress(messages: StatusMessage[]): number {
  const weights: Record<string, number> = {
    scrape: 10, plan: 20, generate: 45, critique: 70,
    regenerate: 78, assemble: 90, done: 100, error: 0,
  };
  // Walk messages in order, track highest non-error
  let highest = 5;
  for (const m of messages) {
    if (m.type === "error") continue;
    const w = weights[m.type] ?? 0;
    if (w > highest) highest = w;
  }
  return highest;
}

function deriveStepLabel(messages: StatusMessage[]): string {
  if (messages.length === 0) return "Connecting…";
  const last = messages[messages.length - 1];
  const labels: Record<string, string> = {
    scrape: "Scraping", plan: "Planning", generate: "Generating shots",
    critique: "Reviewing shots", regenerate: "Refining shots",
    assemble: "Assembling video", done: "Done", error: "Failed",
  };
  return labels[last.type] ?? last.type;
}

function shotStatusMeta(s: ShotState["status"]): { label: string; color: string; icon: string; pulse: boolean } {
  const m: Record<ShotState["status"], { label: string; color: string; icon: string; pulse: boolean }> = {
    pending:          { label: "Pending",     color: "#52525b", icon: "○", pulse: false },
    generating_image: { label: "Generating",  color: "#22d3ee", icon: "🎬", pulse: true },
    generating_video: { label: "Generating",  color: "#22d3ee", icon: "🎬", pulse: true },
    critiquing:       { label: "Reviewing",   color: "#60a5fa", icon: "👁️", pulse: true },
    regenerating:     { label: "Refining",    color: "#f59e0b", icon: "🔁", pulse: true },
    done:             { label: "Done",        color: "#4ade80", icon: "✓",  pulse: false },
    failed:           { label: "Failed",      color: "#fb7185", icon: "✕",  pulse: false },
  };
  return m[s] ?? { label: s, color: "#a1a1aa", icon: "○", pulse: false };
}

function msgKey(m: StatusMessage) {
  return `${m.timestamp}|${m.type}|${m.message}`;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav className="rw-nav">
      <span className="rw-nav-logo">Reelwright</span>
      <div className="rw-steps">
        <span>1. URL</span><span className="sep">›</span>
        <span>2. Review</span><span className="sep">›</span>
        <span>3. Plan</span><span className="sep">›</span>
        <span className="active">4. Generate</span><span className="sep">›</span>
        <span>5. Result</span>
      </div>
    </nav>
  );
}

// ─── Shot card (timeline) ─────────────────────────────────────────────────────
function ShotCard({ shot, tooltip }: { shot: ShotState; tooltip?: string }) {
  const meta = shotStatusMeta(shot.status);
  const [showTip, setShowTip] = useState(false);
  const isActive = meta.pulse;

  return (
    <div
      style={{ width: 110, flexShrink: 0, position: "relative" }}
      onMouseEnter={() => tooltip && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      {/* Active ring */}
      {isActive && (
        <div style={{
          position: "absolute", inset: -2, borderRadius: 10,
          background: "var(--accent-grad)", zIndex: 0,
          animation: "shot-ring-pulse 2s ease-in-out infinite",
        }} />
      )}
      {/* Card face */}
      <div style={{
        position: "relative", zIndex: 1,
        borderRadius: 8, overflow: "hidden",
        border: `1px solid ${isActive ? "transparent" : "var(--border)"}`,
        background: "rgba(255,255,255,0.04)",
        aspectRatio: "9/16", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transition: "border-color 0.3s",
      }}>
        {shot.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={shot.image_url} alt={`Shot ${shot.index + 1}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", animation: "glow-in 0.4s ease-out" }}
          />
        ) : (
          <span style={{ fontSize: "1.75rem", opacity: 0.25 }}>🎬</span>
        )}
        {/* Status badge overlay */}
        <div style={{
          position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)",
          background: "rgba(9,9,11,0.8)", border: `1px solid ${meta.color}33`,
          borderRadius: 9999, padding: "2px 8px", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{ fontSize: "0.625rem" }}>{meta.icon}</span>
          <span style={{ fontSize: "0.625rem", fontWeight: 600, color: meta.color }}>{meta.label}</span>
        </div>
      </div>
      {/* Label */}
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--fg-dim)" }}>Shot {shot.index + 1}</p>
      </div>
      {/* Tooltip */}
      {showTip && tooltip && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)", width: 200, background: "#1c1c1f",
          border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
          fontSize: "0.75rem", color: "#fda4af", zIndex: 50, lineHeight: 1.4,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {tooltip}
        </div>
      )}
    </div>
  );
}

// ─── Feed item ────────────────────────────────────────────────────────────────
function FeedItem({ msg, isLatest, running }: { msg: StatusMessage; isLatest: boolean; running: boolean }) {
  const color = TYPE_COLOR[msg.type] ?? "#a1a1aa";
  const icon = TYPE_ICON[msg.type] ?? "•";
  const pulseActive = isLatest && running && msg.type !== "done" && msg.type !== "error";

  return (
    <div className="rw-feed-item">
      <div
        className="rw-feed-icon"
        style={{
          background: `${color}18`, color,
          animation: pulseActive ? "pulse-dot 1.5s ease-in-out infinite" : "none",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.8125rem", color: isLatest ? "var(--fg)" : "var(--fg-muted)", lineHeight: 1.45, wordBreak: "break-word" }}>
          {msg.message}
        </p>
        <p style={{ fontSize: "0.6875rem", color: "var(--fg-dim)", marginTop: 2 }}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

// ─── Error overlay card ───────────────────────────────────────────────────────
function ErrorCard({
  title, detail, onRetry, onBack,
}: {
  title: string; detail?: string | null;
  onRetry?: () => void; onBack?: () => void;
}) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(9,9,11,0.88)", backdropFilter: "blur(8px)",
      borderRadius: 12, padding: 24, flexDirection: "column", textAlign: "center", gap: 16,
    }}>
      <div style={{ fontSize: "2.5rem" }}>⚠️</div>
      <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--fg)" }}>{title}</p>
      {detail && (
        <p style={{ fontSize: "0.8125rem", color: "#fda4af", maxWidth: 280, lineHeight: 1.5 }}>{detail}</p>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
        {onRetry && (
          <button id="gen-retry-btn" className="rw-btn-primary" style={{ fontSize: "0.875rem", padding: "10px 20px" }} onClick={onRetry}>
            Try again
          </button>
        )}
        {onBack && (
          <button id="gen-back-btn" className="rw-btn-secondary" style={{ fontSize: "0.875rem" }} onClick={onBack}>
            Back to plan
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div style={{
      position: "fixed", top: 72, right: 20, zIndex: 100,
      background: "#1c1c1f", border: "1px solid rgba(251,113,133,0.3)",
      borderRadius: 8, padding: "10px 16px", fontSize: "0.8125rem", color: "#fda4af",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", animation: "glow-in 0.2s ease-out",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span>⚠️</span> {text}
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", marginLeft: 4, fontSize: "0.875rem" }}>✕</button>
    </div>
  );
}

// ─── Core page ────────────────────────────────────────────────────────────────
function GenerateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = params.get("thread") ?? "";

  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const seenKeys = useRef(new Set<string>());

  const [shots, setShots] = useState<ShotState[]>([]);
  const [overallStatus, setOverallStatus] = useState<"running" | "complete" | "error">("running");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [connectionToast, setConnectionToast] = useState<string | null>(null);
  const [originUrl, setOriginUrl] = useState<string>("");
  const [latestVideoUrl, setLatestVideoUrl] = useState<string | null>(null);

  const unsubRef = useRef<(() => void) | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  const stopAll = useCallback(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
  }, []);

  const addMessages = useCallback((incoming: StatusMessage[]) => {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        const k = msgKey(m);
        if (!seenKeys.current.has(k)) {
          seenKeys.current.add(k);
          next.push(m);
        }
      }
      return next;
    });
  }, []);

  const refreshShots = useCallback(async () => {
    if (!threadId) return;
    try {
      const snap = await getState(threadId);
      if (snap.state.shots && snap.state.shots.length > 0) {
        setShots(snap.state.shots);
        // Track most recently completed shot video
        const done = snap.state.shots.filter((s) => s.status === "done" && s.video_url);
        if (done.length > 0) setLatestVideoUrl(done[done.length - 1].video_url ?? null);
      }
    } catch { /* ignore */ }
  }, [threadId]);

  const openStream = useCallback(() => {
    if (!threadId) return;

    unsubRef.current = streamAgent(threadId, {
      onStatus: (msg) => {
        // Check before adding — seenKeys is updated inside addMessages
        const isNew = !seenKeys.current.has(msgKey(msg));
        addMessages([msg]);
        if (isNew && ["done", "error", "critique", "regenerate"].includes(msg.type)) {
          void refreshShots();
        }
      },
      onComplete: (data) => {
        setOverallStatus("complete");
        stopAll();
        router.push(`/result?thread=${threadId}&video_url=${encodeURIComponent(data.final_video_url)}`);
      },
      onError: (err) => {
        if (err.message.startsWith("SSE connection error")) {
          if (reconnectAttempts.current >= 2) {
            setConnectionToast(null);
            setBackendError("Could not reconnect to server. Click Retry to try again.");
            setOverallStatus("error");
            stopAll();
            return;
          }
          reconnectAttempts.current += 1;
          setConnectionToast(`Lost connection. Reconnecting (attempt ${reconnectAttempts.current}/2)…`);
          reconnectRef.current = setTimeout(() => openStream(), 2000);
        } else {
          setBackendError(err.message || "Something went wrong during generation.");
          setOverallStatus("error");
          stopAll();
        }
      },
    });
  }, [threadId, addMessages, refreshShots, router, stopAll]);

  // Fetch initial state on mount
  useEffect(() => {
    if (!threadId) return;
    void (async () => {
      try {
        const snap = await getState(threadId);
        if (snap.state.url) setOriginUrl(snap.state.url);
        // Backfill messages already in state
        if (snap.state.status_messages) addMessages(snap.state.status_messages);
        // Initial shots
        if (snap.state.shots?.length) {
          setShots(snap.state.shots);
          const done = snap.state.shots.filter((s) => s.status === "done" && s.video_url);
          if (done.length > 0) setLatestVideoUrl(done[done.length - 1].video_url ?? null);
        }
        // If already complete
        if (snap.state.final_video_url) {
          setOverallStatus("complete");
          router.push(`/result?thread=${threadId}&video_url=${encodeURIComponent(snap.state.final_video_url)}`);
          return;
        }
        // If already in error with no next — partial failure
        if (snap.state.error && snap.next.length === 0) {
          setBackendError(snap.state.error);
          setOverallStatus("error");
        }
      } catch { /* open stream anyway */ }
    })();

    openStream();

    return () => { stopAll(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const handleRetry = async () => {
    if (!originUrl) { router.push("/"); return; }
    try {
      const { thread_id } = await runAgent(originUrl);
      router.push(`/generate?thread=${thread_id}`);
    } catch {
      router.push("/");
    }
  };

  const handleBackToPlan = () => router.push(`/plan?thread=${threadId}`);

  const progress = deriveProgress(messages);
  const stepLabel = deriveStepLabel(messages);
  const running = overallStatus === "running";
  const reversedMsgs = [...messages].reverse();

  // ── Shot error tooltips
  const shotTooltips: Record<number, string> = {};
  for (const m of messages) {
    if (m.type === "error") {
      const match = m.message.match(/shot\s+(\d+)/i);
      if (match) shotTooltips[parseInt(match[1]) - 1] = m.message;
    }
  }

  return (
    <>
      {/* Full-width progress bar */}
      <div style={{ position: "fixed", top: 56, left: 0, right: 0, zIndex: 40 }}>
        <div style={{ height: 4, background: "rgba(255,255,255,0.05)" }}>
          <div style={{
            height: "100%", background: "var(--accent-grad)",
            width: `${progress}%`, transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
          }} />
        </div>
        <div style={{
          padding: "4px 24px", fontSize: "0.6875rem", color: "var(--fg-dim)",
          fontFamily: "var(--font-geist-mono)", letterSpacing: "0.02em",
          background: "rgba(9,9,11,0.7)",
        }}>
          {stepLabel} · {progress}%
        </div>
      </div>

      {/* Toast */}
      {connectionToast && <Toast text={connectionToast} onDismiss={() => setConnectionToast(null)} />}

      <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", paddingTop: 32 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-dim)", marginBottom: 6 }}>
            Step 4 — Generation
          </p>
          <h1 style={{ fontSize: "clamp(1.25rem,3vw,1.875rem)", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--fg)" }}>
            {overallStatus === "complete" ? "Wrapping up…" : overallStatus === "error" ? "Generation stopped" : "Generating your video"}
          </h1>
        </div>

        {/* 60/40 split */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* ── Left: Preview + shot timeline (60%) */}
          <div style={{ flex: "0 0 clamp(280px, 58%, 600px)", minWidth: 280 }}>

            {/* Preview card */}
            <div className="rw-card" style={{ padding: 16, marginBottom: 16, position: "relative", overflow: "hidden" }}>
              <div style={{
                borderRadius: 8, overflow: "hidden", background: "#000",
                aspectRatio: "9/16", maxHeight: 360, margin: "0 auto",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative",
              }}>
                {latestVideoUrl && overallStatus !== "error" ? (
                  <video
                    key={latestVideoUrl}
                    src={latestVideoUrl}
                    autoPlay muted loop playsInline
                    style={{ width: "100%", height: "100%", objectFit: "cover", animation: "glow-in 0.4s ease-out" }}
                  />
                ) : (
                  <div style={{
                    width: "100%", height: "100%", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 12,
                    background: running
                      ? "linear-gradient(135deg, rgba(6,182,212,0.06) 0%, rgba(59,130,246,0.08) 100%)"
                      : "rgba(251,113,133,0.05)",
                    animation: running ? "shot-ring-pulse 3s ease-in-out infinite" : "none",
                  }}>
                    <span style={{ fontSize: "3rem", opacity: 0.2 }}>🎬</span>
                    <p style={{ fontSize: "0.8125rem", color: "var(--fg-dim)" }}>
                      {running ? "Preview will appear when first shot is ready" : "No preview available"}
                    </p>
                  </div>
                )}

                {/* Error overlay */}
                {overallStatus === "error" && (
                  <ErrorCard
                    title="Generation stopped"
                    detail={backendError}
                    onRetry={handleRetry}
                    onBack={handleBackToPlan}
                  />
                )}
              </div>
            </div>

            {/* Shot timeline */}
            {shots.length > 0 && (
              <div className="rw-card" style={{ padding: 16 }}>
                <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--fg-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                  Shot progress
                </p>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto", paddingBottom: 4 }}>
                  {shots.map((shot, i) => (
                    <div key={shot.index} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                      <ShotCard shot={shot} tooltip={shotTooltips[shot.index]} />
                      {i < shots.length - 1 && (
                        <div style={{ width: 20, height: 1, background: "var(--border)", flexShrink: 0, marginBottom: 28 }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Activity feed (40%) */}
          <div style={{ flex: "1 1 260px", minWidth: 260 }}>
            <div className="rw-card" style={{ padding: 0, overflow: "hidden" }}>
              {/* Feed header */}
              <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                {running && (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-from)", animation: "pulse-dot 1.5s ease-in-out infinite", flexShrink: 0 }} />
                )}
                <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Agent activity
                </p>
                <span style={{ marginLeft: "auto", fontSize: "0.6875rem", color: "var(--fg-dim)" }}>{messages.length} events</span>
              </div>

              {/* Scroll area with soft fade edges */}
              <div style={{ position: "relative" }}>
                {/* Top fade */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 20, background: "linear-gradient(to bottom, var(--bg-card-solid), transparent)", zIndex: 10, pointerEvents: "none" }} />

                <div style={{ maxHeight: 520, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column-reverse" }}>
                  {messages.length === 0 ? (
                    <div style={{ padding: "20px 0", display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="rw-spinner" />
                      <p style={{ fontSize: "0.875rem", color: "var(--fg-dim)" }}>Connecting to agent…</p>
                    </div>
                  ) : (
                    reversedMsgs.map((msg, i) => (
                      <FeedItem key={msgKey(msg)} msg={msg} isLatest={i === 0} running={running} />
                    ))
                  )}
                </div>

                {/* Bottom fade */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 20, background: "linear-gradient(to top, var(--bg-card-solid), transparent)", zIndex: 10, pointerEvents: "none" }} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

export default function GeneratePage() {
  return (
    <div className="rw-page">
      <Nav />
      <main className="rw-main">
        <Suspense fallback={<div style={{ color: "var(--fg-muted)", padding: 40 }}>Loading…</div>}>
          <GenerateInner />
        </Suspense>
      </main>
    </div>
  );
}
