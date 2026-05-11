"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getState, type StatusMessage } from "@/lib/api";

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

function Nav() {
  return (
    <nav className="rw-nav">
      <Link href="/" className="rw-nav-logo" style={{ textDecoration: "none", color: "inherit" }}>Reelwright</Link>
      <div className="rw-steps">
        <span>1. URL</span><span className="sep">›</span>
        <span>2. Review</span><span className="sep">›</span>
        <span>3. Plan</span><span className="sep">›</span>
        <span>4. Generate</span><span className="sep">›</span>
        <span className="active">5. Result</span>
      </div>
    </nav>
  );
}

function CopiedToast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", top: 72, right: 20, zIndex: 100,
      background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)",
      borderRadius: 8, padding: "8px 16px", fontSize: "0.8125rem", color: "#4ade80",
      animation: "glow-in 0.2s ease-out",
    }}>
      ✓ Copied to clipboard
    </div>
  );
}

function computeStats(messages: StatusMessage[]) {
  const scrapeMsg = messages.find((m) => m.type === "scrape");
  const doneMsg = messages.find((m) => m.type === "done");
  const genMsgs = messages.filter((m) => m.type === "generate");
  const shots = new Set(genMsgs.map((m) => { const match = m.message.match(/shot\s+(\d+)/i); return match?.[1]; })).size;

  let duration = "";
  if (scrapeMsg && doneMsg) {
    const start = new Date(scrapeMsg.timestamp).getTime();
    const end = new Date(doneMsg.timestamp).getTime();
    const secs = Math.round((end - start) / 1000);
    duration = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  }
  return { duration, shots: shots || 0 };
}

function ResultInner() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = params.get("thread") ?? "";
  const urlParam = params.get("video_url") ?? "";

  const [videoUrl, setVideoUrl] = useState(urlParam);
  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const [dominantColor, setDominantColor] = useState("#06b6d4");
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shimmer, setShimmer] = useState(true);
  const [loading, setLoading] = useState(!urlParam);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Remove shimmer after 700ms
  useEffect(() => {
    const t = setTimeout(() => setShimmer(false), 700);
    return () => clearTimeout(t);
  }, []);

  // On mount: fetch state for messages, halo color, and fallback video_url
  useEffect(() => {
    if (!threadId) return;
    void (async () => {
      try {
        const snap = await getState(threadId);
        if (snap.state.status_messages) setMessages(snap.state.status_messages);
        if (snap.state.scrape?.dominant_colors?.[0]) setDominantColor(snap.state.scrape.dominant_colors[0]);

        if (!videoUrl) {
          if (snap.state.final_video_url) {
            setVideoUrl(snap.state.final_video_url);
          } else {
            // No video at all — send back to generate
            router.push(`/generate?thread=${threadId}`);
            return;
          }
        }
      } catch {
        if (!videoUrl) router.push("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [threadId, videoUrl, router]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopied(true);
    } catch { /* ignore */ }
  };

  const handleDownload = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If cross-origin (backend on 8084, frontend on 3004), the download attribute
    // won't trigger a save dialog — fall back to blob download
    try {
      e.preventDefault();
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `reelwright-${threadId.slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch {
      // Fallback: plain navigation
      window.open(videoUrl, "_blank");
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  };

  const stats = computeStats(messages);

  if (loading) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: 80 }}>
        <span className="rw-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: "0 auto" }} />
        <p style={{ marginTop: 16, color: "var(--fg-muted)" }}>Loading your video…</p>
      </div>
    );
  }

  if (!videoUrl) return null;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", animation: "glow-in 0.5s ease-out both" }}>
      {copied && <CopiedToast onDone={() => setCopied(false)} />}
      {/* Success badge */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "4px 14px", borderRadius: 9999, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)" }}>
          <span style={{ fontSize: "0.875rem" }}>✅</span>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#4ade80", letterSpacing: "0.04em" }}>Video ready</span>
        </div>
        <h1 style={{ fontSize: "clamp(1.5rem,4vw,2rem)", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--fg)", marginBottom: 6 }}>Your ad is ready</h1>
        <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem" }}>Download, share, or generate variations.</p>
      </div>

      {/* Video card with halo glow */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        {/* Radial halo from dominant brand color */}
        <div style={{
          position: "absolute", inset: -24, borderRadius: 36, zIndex: 0,
          background: `radial-gradient(ellipse at center, ${dominantColor}22 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
        <div className="rw-card" style={{
          position: "relative", zIndex: 1, padding: 12, overflow: "hidden",
        }}>
          {/* Shimmer overlay */}
          {shimmer && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10, borderRadius: 12,
              background: "linear-gradient(105deg, transparent 40%, rgba(6,182,212,0.18) 50%, transparent 60%)",
              backgroundSize: "200% 100%",
              animation: "coral-shimmer 0.7s ease-out forwards",
              pointerEvents: "none",
            }} />
          )}
          <div style={{ borderRadius: 8, overflow: "hidden", background: "#000", aspectRatio: "9/16", maxHeight: "58vh", margin: "0 auto", position: "relative" }}>
            <video
              id="result-video"
              ref={videoRef}
              src={videoUrl}
              autoPlay muted={muted} playsInline controls
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
            {/* Sound on pill */}
            {muted && (
              <button
                id="sound-on-btn"
                onClick={toggleMute}
                style={{
                  position: "absolute", bottom: 52, right: 12,
                  background: "rgba(9,9,11,0.8)", border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 9999, padding: "5px 12px", color: "var(--fg)",
                  fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  animation: "glow-in 0.3s ease-out 0.8s both",
                }}
              >
                🔇 Sound on
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <a
          id="download-btn"
          href={videoUrl}
          onClick={handleDownload}
          className="rw-btn-primary"
          style={{ textDecoration: "none" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download MP4
        </a>
        <button id="copy-link-btn" className="rw-btn-secondary" onClick={handleCopy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy link
        </button>
        <button id="generate-variants-btn" className="rw-btn-secondary" onClick={() => router.push(`/plan?thread=${threadId}`)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-3.35"/>
          </svg>
          Generate variants
        </button>
      </div>

      {/* Run stats */}
      {(stats.duration || stats.shots > 0) && (
        <p style={{ fontSize: "0.8125rem", color: "var(--fg-dim)", marginBottom: 20 }}>
          {[
            stats.duration && `Generated in ${stats.duration}`,
            stats.shots > 0 && `${stats.shots} shot${stats.shots !== 1 ? "s" : ""}`,
          ].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Expandable timeline */}
      <div className="rw-card" style={{ overflow: "hidden" }}>
        <button
          id="timeline-toggle-btn"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", color: "var(--fg)" }}
          onClick={() => setTimelineOpen(!timelineOpen)}
        >
          <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>How Reelwright made this</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: timelineOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--fg-muted)" }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {timelineOpen && (
          <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
            {messages.length === 0 ? (
              <p style={{ fontSize: "0.875rem", color: "var(--fg-dim)", paddingTop: 14 }}>No timeline available.</p>
            ) : (
              <div style={{ paddingTop: 12 }}>
                {messages.map((msg, i) => {
                  const color = TYPE_COLOR[msg.type] ?? "#a1a1aa";
                  const icon = TYPE_ICON[msg.type] ?? "•";
                  return (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i < messages.length - 1 ? "1px solid rgba(39,39,42,0.4)" : "none" }}>
                      <div className="rw-feed-icon" style={{ background: `${color}18`, color, flexShrink: 0 }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.8125rem", color: "var(--fg-muted)", lineHeight: 1.4 }}>{msg.message}</p>
                        <p style={{ fontSize: "0.6875rem", color: "var(--fg-dim)", marginTop: 2 }}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <div className="rw-page">
      <Nav />
      <main className="rw-main">
        <Suspense fallback={<div style={{ color: "var(--fg-muted)", padding: 40 }}>Loading…</div>}>
          <ResultInner />
        </Suspense>
      </main>
    </div>
  );
}
