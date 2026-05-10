"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { runAgent } from "@/lib/api";

const EXAMPLE_URLS = [
  "https://www.allbirds.com/products/mens-wool-runners",
  "https://www.brooklinen.com/products/classic-percale-sheet-set",
  "https://www.caudalie.com/en/resveratrol-lift/resveratrol-lift-face-lifting-soft-cream",
];

function Nav({ step }: { step?: number }) {
  return (
    <nav className="rw-nav">
      <span className="rw-nav-logo">Reelwright</span>
      {step !== undefined && (
        <div className="rw-steps">
          <span className={step === 1 ? "active" : ""}>1. URL</span>
          <span className="sep">›</span>
          <span className={step === 2 ? "active" : ""}>2. Review</span>
          <span className="sep">›</span>
          <span className={step === 3 ? "active" : ""}>3. Plan</span>
          <span className="sep">›</span>
          <span className={step === 4 ? "active" : ""}>4. Generate</span>
          <span className="sep">›</span>
          <span className={step === 5 ? "active" : ""}>5. Result</span>
        </div>
      )}
    </nav>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    try {
      const { thread_id } = await runAgent(trimmed);
      // Navigate immediately — let /review handle the loading wait
      router.push(`/review?thread=${thread_id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start agent. Is the backend running?"
      );
      setLoading(false);
    }
  };

  const handleChipClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
    inputRef.current?.focus();
  };

  return (
    <div className="rw-page">
      <Nav step={1} />

      <main className="rw-main" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "calc(100vh - 56px)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>

          {/* Hero */}
          <div style={{ marginBottom: 48, textAlign: "center" }}>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-dim)", marginBottom: 16 }}>
              AI video agent
            </p>
            <h1 style={{ fontSize: "clamp(2rem, 6vw, 3.25rem)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.03em", color: "var(--fg)", marginBottom: 16 }}>
              Turn any product URL into a{" "}
              <span className="rw-gradient-text">9:16 video ad</span>
            </h1>
            <p style={{ fontSize: "1rem", color: "var(--fg-muted)", lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
              Paste a D2C product page. Reelwright scrapes it, plans a video, generates each shot with Runway, and assembles a watchable MP4 — end to end in ~3 minutes.
            </p>
          </div>

          {/* Form card */}
          <div className="rw-card" style={{ padding: 28 }}>
            <form onSubmit={handleSubmit}>
              <label
                htmlFor="product-url"
                style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--fg-muted)", marginBottom: 10, letterSpacing: "0.02em", textTransform: "uppercase" }}
              >
                Product URL
              </label>

              <div style={{ display: "flex", gap: 10 }}>
                <input
                  id="product-url"
                  ref={inputRef}
                  className="rw-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://brand.com/products/..."
                  disabled={loading}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  id="generate-btn"
                  type="submit"
                  className="rw-btn-primary"
                  disabled={loading || !url.trim()}
                  style={{ flexShrink: 0 }}
                >
                  {loading ? (
                    <>
                      <span className="rw-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                      Starting…
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Generate
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="rw-error" style={{ marginTop: 12 }}>
                  {error}
                </div>
              )}
            </form>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "0.75rem", color: "var(--fg-dim)", whiteSpace: "nowrap" }}>try an example</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {/* Example chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EXAMPLE_URLS.map((exampleUrl) => {
                const domain = new URL(exampleUrl).hostname.replace("www.", "");
                const slug = exampleUrl.split("/products/")[1]?.replace(/-/g, " ") ?? domain;
                return (
                  <button
                    key={exampleUrl}
                    id={`chip-${domain}`}
                    type="button"
                    className="rw-chip"
                    onClick={() => handleChipClick(exampleUrl)}
                    disabled={loading}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    {slug}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer hint */}
          <p style={{ textAlign: "center", marginTop: 24, fontSize: "0.8125rem", color: "var(--fg-dim)" }}>
            Generation takes ~3 minutes · powered by Runway Gen‑4 + Groq
          </p>
        </div>
      </main>
    </div>
  );
}
