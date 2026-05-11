"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  deleteScrapeImage,
  getState,
  resumeAgent,
  streamAgent,
  type ScrapeData,
  type StatusMessage,
} from "@/lib/api";

function Nav() {
  return (
    <nav className="rw-nav">
      <Link href="/" className="rw-nav-logo" style={{ textDecoration: "none", color: "inherit" }}>Reelwright</Link>
      <div className="rw-steps">
        <span>1. URL</span>
        <span className="sep">›</span>
        <span className="active">2. Review</span>
        <span className="sep">›</span>
        <span>3. Plan</span>
        <span className="sep">›</span>
        <span>4. Generate</span>
        <span className="sep">›</span>
        <span>5. Result</span>
      </div>
    </nav>
  );
}

function typeIcon(type: string) {
  return (
    {
      scrape: "🔍",
      plan: "📋",
      generate: "🎬",
      critique: "🔎",
      regenerate: "🔄",
      assemble: "🎞",
      done: "✅",
      error: "❌",
    }[type] ?? "•"
  );
}

// Phase 7 — defensive copy_block filter
const NAV_PATTERN =
  /^(cart|shop|sign in|log in|search|menu|home|sale|new|account|wishlist|bag|checkout|explore|collection|back|view|see all|all|filter|sort)/i;
const MD_HEADING = /^#{1,6}\s*/; // strip ### prefix from display

function filterCopyBlocks(blocks: string[]): string[] {
  return blocks
    .map((b) => b.replace(MD_HEADING, "").trim()) // strip ### headings first
    .filter((b) => !b.startsWith("![](")) // no markdown images
    .filter((b) => !NAV_PATTERN.test(b)) // no nav cruft
    .filter((b) => b.length >= 10) // no too-short items
    .filter((b) => !/^[A-Z\s]+$/.test(b)) // no ALL-CAPS section labels
    .map((b) => (b.length > 200 ? b.slice(0, 197) + "…" : b)) // truncate long
    .slice(0, 5); // top 5 cleanest
}

function FeedSkeleton({ messages }: { messages: StatusMessage[] }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: 32 }}>
        <div
          className="rw-skeleton"
          style={{ height: 14, width: 120, marginBottom: 12 }}
        />
        <div
          className="rw-skeleton"
          style={{ height: 36, width: "65%", marginBottom: 8 }}
        />
        <div className="rw-skeleton" style={{ height: 18, width: "50%" }} />
      </div>
      <div className="rw-card" style={{ padding: 20, marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span className="rw-spinner" />
          <span style={{ fontSize: "0.875rem", color: "var(--fg-muted)" }}>
            Scraping product page…
          </span>
        </div>
        {messages
          .slice(-5)
          .reverse()
          .map((msg, i) => (
            <div key={i} className="rw-feed-item">
              <div
                className="rw-feed-icon"
                style={{
                  background: "rgba(6,182,212,0.12)",
                  color: "var(--accent-from)",
                }}
              >
                {typeIcon(msg.type)}
              </div>
              <div>
                <p style={{ fontSize: "0.875rem", color: "var(--fg)" }}>
                  {msg.message}
                </p>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--fg-dim)",
                    marginTop: 2,
                  }}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
        {messages.length === 0 && (
          <p style={{ fontSize: "0.875rem", color: "var(--fg-dim)" }}>
            Waiting for first update…
          </p>
        )}
      </div>
      <div className="rw-card" style={{ padding: 24 }}>
        {[1, 2, 3].map((k) => (
          <div
            key={k}
            className="rw-skeleton"
            style={{ height: 14, width: `${80 - k * 12}%`, marginBottom: 10 }}
          />
        ))}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 8,
            marginTop: 12,
          }}
        >
          {[1, 2, 3, 4].map((k) => (
            <div
              key={k}
              className="rw-skeleton"
              style={{ aspectRatio: "1", borderRadius: 8 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScrapeCard({
  scrape,
  threadId,
  onContinue,
  continuing,
}: {
  scrape: ScrapeData;
  threadId: string;
  onContinue: () => void;
  continuing: boolean;
}) {
  const [images, setImages] = useState<string[]>(scrape.product_images);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const hasImages = images.length > 0;

  const handleDeleteImage = async (imgUrl: string) => {
    if (!confirm("Remove this image from the scrape?")) return;
    setDeletingUrl(imgUrl);
    try {
      const result = await deleteScrapeImage(threadId, imgUrl);
      setImages(result.product_images);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete image");
    } finally {
      setDeletingUrl(null);
    }
  };
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: 28 }}>
        <p
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--fg-dim)",
            marginBottom: 8,
          }}
        >
          Step 2 — Scrape Review
        </p>
        <h1
          style={{
            fontSize: "clamp(1.5rem,4vw,2.25rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--fg)",
            marginBottom: 8,
          }}
        >
          We found your product
        </h1>
        <p
          style={{
            color: "var(--fg-muted)",
            fontSize: "0.9375rem",
            lineHeight: 1.5,
          }}
        >
          Review what was scraped. This data drives everything downstream.
        </p>
      </div>
      {!hasImages && (
        <div className="rw-warning" style={{ marginBottom: 20 }}>
          ⚠️ No product images found — generated video may not match the actual
          product. Continue anyway?
        </div>
      )}
      <div className="rw-card" style={{ padding: 24, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {scrape.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scrape.logo_url}
              alt="Brand logo"
              style={{
                height: 40,
                maxWidth: 120,
                objectFit: "contain",
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
                padding: 4,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--fg-dim)",
                marginBottom: 2,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Brand
            </p>
            <p
              style={{ fontSize: "1rem", fontWeight: 600, color: "var(--fg)" }}
            >
              {scrape.brand_name ??
                new URL(scrape.source_url).hostname.replace("www.", "")}
            </p>
          </div>
        </div>
        {scrape.dominant_colors.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--fg-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Brand colours
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {scrape.dominant_colors.map((hex, i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <div
                    className="rw-swatch"
                    style={{ background: hex }}
                    title={hex}
                  />
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--fg-dim)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {hex}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {(() => {
          const clean = filterCopyBlocks(scrape.copy_blocks);
          return (
            clean.length > 0 && (
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--fg-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 10,
                  }}
                >
                  Product copy
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {clean.map((block, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--accent-from)",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        ›
                      </span>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          color: "var(--fg-muted)",
                          lineHeight: 1.5,
                        }}
                      >
                        {block}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          );
        })()}
      </div>
      {hasImages && (
        <div className="rw-card" style={{ padding: 24, marginBottom: 24 }}>
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--fg-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            Product images ({images.length})
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))",
              gap: 8,
            }}
          >
            {images.map((imgUrl, i) => (
              <div
                key={imgUrl}
                className="group"
                style={{
                  position: "relative",
                  aspectRatio: "1",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--border)",
                  transition: "opacity 0.2s",
                  opacity: deletingUrl === imgUrl ? 0.4 : 1,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl}
                  alt={`Product ${i + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
                {i === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      background: "var(--accent-grad)",
                      borderRadius: 9999,
                      padding: "2px 8px",
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    Primary
                  </div>
                )}
                <button
                  onClick={() => handleDeleteImage(imgUrl)}
                  disabled={deletingUrl === imgUrl}
                  className="opacity-0 group-hover:opacity-100"
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    background: "rgba(220, 38, 38, 0.9)",
                    border: "none",
                    borderRadius: 9999,
                    width: 24,
                    height: 24,
                    padding: 0,
                    cursor: "pointer",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "opacity 0.2s",
                    fontSize: "0.875rem",
                  }}
                  title="Remove image"
                >
                  {deletingUrl === imgUrl ? (
                    <span
                      className="rw-spinner"
                      style={{ width: 12, height: 12, borderWidth: 1.5 }}
                    />
                  ) : (
                    "✕"
                  )}
                </button>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
            }}
          >
            {!addOpen ? (
              <button
                onClick={() => setAddOpen(true)}
                style={{
                  background: "none",
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--fg-muted)",
                  fontSize: "0.875rem",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>+</span> Add image URL
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder="Paste image URL (coming soon)"
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--fg)",
                    fontSize: "0.875rem",
                  }}
                />
                <button
                  onClick={() => {
                    alert(
                      "Add image is coming soon. For now, the agent uses scraped images only.",
                    );
                    setAddOpen(false);
                    setAddUrl("");
                  }}
                  className="rw-btn-secondary"
                  style={{ fontSize: "0.8125rem", padding: "8px 14px" }}
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setAddOpen(false);
                    setAddUrl("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fg-dim)",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    padding: "8px",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          id="review-continue-btn"
          className="rw-btn-primary"
          onClick={onContinue}
          disabled={continuing}
        >
          {continuing ? (
            <>
              <span
                className="rw-spinner"
                style={{ width: 16, height: 16, borderWidth: 2 }}
              />
              Planning…
            </>
          ) : (
            <>
              Looks good — plan my video{" "}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ReviewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = params.get("thread") ?? "";
  const [scrape, setScrape] = useState<ScrapeData | null>(null);
  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAll = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!threadId) {
      setError("No thread ID in URL.");
      return;
    }
    let stopped = false;

    unsubRef.current = streamAgent(threadId, {
      onStatus: (msg) => {
        if (!stopped) setMessages((p) => [...p, msg]);
      },
      onComplete: () => {},
      onError: () => {},
    });

    const poll = async () => {
      try {
        const snap = await getState(threadId);
        if (stopped) return;
        if (snap.state.error) {
          setError(snap.state.error);
          stopAll();
          return;
        }
        if (snap.state.scrape && snap.next.includes("plan_node")) {
          setScrape(snap.state.scrape);
          stopAll();
          return;
        }
        if (snap.state.final_video_url) {
          router.push(
            `/result?thread=${threadId}&video_url=${encodeURIComponent(snap.state.final_video_url)}`,
          );
          stopAll();
          return;
        }
      } catch {
        /* keep polling */
      }
    };
    void poll();
    pollRef.current = setInterval(() => {
      void poll();
    }, 1000);
    return () => {
      stopped = true;
      stopAll();
    };
  }, [threadId, router, stopAll]);

  const handleContinue = async () => {
    setContinuing(true);
    try {
      await resumeAgent(threadId);
      router.push(`/plan?thread=${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume.");
      setContinuing(false);
    }
  };

  if (error)
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
        <div className="rw-error" style={{ marginTop: 48 }}>
          <strong>Error:</strong> {error}
        </div>
        <button
          className="rw-btn-secondary"
          style={{ marginTop: 16 }}
          onClick={() => router.push("/")}
        >
          ← Start over
        </button>
      </div>
    );

  return scrape ? (
    <ScrapeCard
      scrape={scrape}
      threadId={threadId}
      onContinue={handleContinue}
      continuing={continuing}
    />
  ) : (
    <FeedSkeleton messages={messages} />
  );
}

export default function ReviewPage() {
  return (
    <div className="rw-page">
      <Nav />
      <main className="rw-main">
        <Suspense
          fallback={
            <div style={{ color: "var(--fg-muted)", padding: 40 }}>
              Loading…
            </div>
          }
        >
          <ReviewInner />
        </Suspense>
      </main>
    </div>
  );
}
