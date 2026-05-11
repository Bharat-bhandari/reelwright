"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { runAgent } from "@/lib/api";

const EXAMPLES = [
  { url: "https://www.allbirds.com/products/mens-cruiser-verdant-green", label: "allbirds.com/cruiser-green", color: "#06b6d4" },
  { url: "https://www.allbirds.com/products/mens-cruiser-canvas-nautical-gold", label: "allbirds.com/cruiser-gold", color: "#f472b6" },
  { url: "https://bellroy.com/products/classic-daypack?color=olive&material=canva_weave#slide-0", label: "bellroy.com/classic-daypack", color: "#fb923c" },
];

const STEPS = [
  { num: "01", title: "Reads", desc: "Brand, copy, images." },
  { num: "02", title: "Plans", desc: "Hook, shots, script." },
  { num: "03", title: "Renders", desc: "Critiques itself." },
];

const PLATFORMS = ["Shopify", "WooCommerce", "BigCommerce", "Webflow", "Custom"];

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
      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav className="rw-nav">
        <Link href="/" className="rw-nav-logo-group" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          {/* Play icon */}
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: "var(--accent-grad)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff" stroke="none">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          </span>
          <span className="rw-nav-logo">Reelwright</span>
        </Link>
        <div className="rw-steps">
          <span className="active">1. URL</span>
          <span className="sep">›</span>
          <span>2. Review</span>
          <span className="sep">›</span>
          <span>3. Plan</span>
          <span className="sep">›</span>
          <span>4. Generate</span>
          <span className="sep">›</span>
          <span>5. Result</span>
        </div>
      </nav>

      {/* ── Main content ───────────────────────────────────── */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center",
        padding: "0 24px", minHeight: "calc(100vh - 56px - 48px)",
      }}>
        <div style={{ maxWidth: 720, width: "100%", textAlign: "center" }}>

          {/* Live agent badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 16px", borderRadius: 9999,
            background: "rgba(6,182,212,0.08)",
            border: "1px solid rgba(6,182,212,0.2)",
            marginBottom: 32,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#4ade80",
              boxShadow: "0 0 6px rgba(74,222,128,0.6)",
            }} />
            <span style={{ fontSize: "0.8125rem", color: "var(--fg-muted)", letterSpacing: "0.02em" }}>
              Live agent · v0.4
            </span>
          </div>

          {/* Hero heading */}
          <h1 style={{
            fontSize: "clamp(2.25rem, 5.5vw, 3.5rem)",
            fontWeight: 700, lineHeight: 1.15,
            letterSpacing: "-0.03em",
            color: "var(--fg)", marginBottom: 20,
          }}>
            Turn any product link into a{" "}
            <span className="rw-gradient-text">scroll‑stopping Reel.</span>
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: "1.0625rem", color: "var(--fg-muted)",
            lineHeight: 1.65, maxWidth: 540, margin: "0 auto 40px",
          }}>
            Reelwright reads the page, plans the spot, and generates it shot by shot —
            critiquing its own work along the way. You stay in the director's chair.
          </p>

          {/* ── URL Input Row ─────────────────────────────── */}
          <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
            <div style={{
              display: "flex", gap: 0,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
              onFocus={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = "var(--accent-from)";
                el.style.boxShadow = "0 0 0 3px rgba(6,182,212,0.12)";
              }}
              onBlur={(e) => {
                const el = e.currentTarget;
                if (!el.contains(e.relatedTarget as Node)) {
                  el.style.borderColor = "var(--border)";
                  el.style.boxShadow = "none";
                }
              }}
            >
              {/* Link icon */}
              <div style={{
                display: "flex", alignItems: "center", paddingLeft: 16,
                color: "var(--fg-dim)", flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <input
                id="product-url"
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-store.com/products/echo-knit"
                disabled={loading}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                style={{
                  flex: 1, border: "none", outline: "none",
                  background: "transparent", color: "var(--fg)",
                  fontSize: "0.9375rem", padding: "16px 12px",
                  fontFamily: "inherit",
                }}
              />
              <button
                id="generate-btn"
                type="submit"
                disabled={loading || !url.trim()}
                style={{
                  border: "none", borderRadius: 8,
                  background: "var(--accent-grad)",
                  color: "#fff", fontWeight: 600,
                  fontSize: "0.875rem", padding: "10px 24px",
                  margin: 6, cursor: loading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  whiteSpace: "nowrap", transition: "opacity 0.2s",
                  opacity: loading || !url.trim() ? 0.4 : 1,
                }}
              >
                {loading ? (
                  <>
                    <span className="rw-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Starting…
                  </>
                ) : (
                  <>
                    Generate
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
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

          {/* ── Example chips ─────────────────────────────── */}
          <div style={{
            display: "flex", flexWrap: "wrap",
            justifyContent: "center", gap: 10,
            alignItems: "center", marginBottom: 48,
          }}>
            <span style={{
              fontSize: "0.8125rem", color: "var(--fg-dim)",
              marginRight: 4,
            }}>
              Try one:
            </span>
            {EXAMPLES.map(({ url: exampleUrl, label, color }) => (
              <button
                key={exampleUrl}
                id={`chip-${label.split("/")[0]}`}
                type="button"
                className="rw-chip"
                onClick={() => handleChipClick(exampleUrl)}
                disabled={loading}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: color, flexShrink: 0,
                }} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Three feature cards ───────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12, marginBottom: 0,
          }}>
            {STEPS.map((step) => (
              <div
                key={step.num}
                style={{
                  padding: "20px 16px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  textAlign: "left",
                }}
              >
                <p style={{
                  fontSize: "0.6875rem", color: "var(--fg-dim)",
                  fontFamily: "var(--font-geist-mono)",
                  marginBottom: 6,
                }}>
                  {step.num}
                </p>
                <p style={{
                  fontSize: "0.9375rem", fontWeight: 600,
                  color: "var(--fg)", marginBottom: 4,
                }}>
                  {step.title}
                </p>
                <p style={{
                  fontSize: "0.8125rem",
                  color: "var(--fg-muted)",
                }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Bottom bar ─────────────────────────────────────── */}
      <footer style={{
        padding: "14px 24px",
        borderTop: "1px solid var(--border-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <span style={{
          fontSize: "0.6875rem", fontWeight: 600,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: "var(--fg-dim)",
        }}>
          Works with
        </span>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          {PLATFORMS.map((p) => (
            <span key={p} style={{
              fontSize: "0.8125rem", color: "var(--fg-muted)",
            }}>
              {p}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
