"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getState,
  resumeAgent,
  directAgent,
  regenerateShotPrompt,
  type VideoPlan,
  type StatusMessage,
} from "@/lib/api";

function Nav() {
  return (
    <nav className="rw-nav">
      <Link href="/" className="rw-nav-logo" style={{ textDecoration: "none", color: "inherit" }}>Reelwright</Link>
      <div className="rw-steps">
        <span>1. URL</span>
        <span className="sep">›</span>
        <span>2. Review</span>
        <span className="sep">›</span>
        <span className="active">3. Plan</span>
        <span className="sep">›</span>
        <span>4. Generate</span>
        <span className="sep">›</span>
        <span>5. Result</span>
      </div>
    </nav>
  );
}

interface AppliedDirection {
  text: string;
  ts: string;
}

function PlanInner() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = params.get("thread") ?? "";

  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [localPlan, setLocalPlan] = useState<VideoPlan | null>(null);
  const [direction, setDirection] = useState("");
  const [directions, setDirections] = useState<AppliedDirection[]>([]);
  const [directing, setDirecting] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(
    null,
  );
  const [openInstructionIndex, setOpenInstructionIndex] = useState<
    number | null
  >(null);
  const [instructionText, setInstructionText] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!threadId) {
      setLoadError("No thread ID.");
      return;
    }
    let stopped = false;

    const poll = async () => {
      try {
        const snap = await getState(threadId);
        if (stopped) return;
        if (snap.state.error) {
          setLoadError(snap.state.error);
          stopPoll();
          return;
        }
        if (snap.state.plan && snap.next.includes("generate_shot_node")) {
          setPlan(snap.state.plan);
          setLocalPlan(snap.state.plan);
          stopPoll();
          return;
        }
        if (snap.state.final_video_url) {
          router.push(
            `/result?thread=${threadId}&video_url=${encodeURIComponent(snap.state.final_video_url)}`,
          );
          stopPoll();
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
      stopPoll();
    };
  }, [threadId, router, stopPoll]);

  const handleDirect = async () => {
    if (!direction.trim()) return;
    setDirecting(true);
    setDirectError(null);
    try {
      const result = await directAgent(threadId, direction.trim());
      setPlan(result.plan);
      setLocalPlan(result.plan);
      setDirections((prev) => [
        { text: direction.trim(), ts: new Date().toLocaleTimeString() },
        ...prev,
      ]);
      setDirection("");
    } catch (err) {
      setDirectError(
        err instanceof Error ? err.message : "Direction failed. Try again.",
      );
    } finally {
      setDirecting(false);
    }
  };

  const handleContinue = async () => {
    setContinuing(true);
    try {
      await resumeAgent(threadId);
      router.push(`/generate?thread=${threadId}`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to resume.");
      setContinuing(false);
    }
  };

  const handleRegenerateShot = async (
    shotIndex: number,
    instruction: string,
  ) => {
    if (!instruction.trim() || regeneratingIndex !== null) return;
    setRegeneratingIndex(shotIndex);
    try {
      const result = await regenerateShotPrompt(
        threadId,
        shotIndex,
        instruction,
      );
      setLocalPlan((prev) => {
        const current = prev ?? plan;
        if (!current) return prev;
        return {
          ...current,
          shots: current.shots.map((s) =>
            s.index === shotIndex
              ? {
                  ...s,
                  description: result.description,
                  image_prompt: result.image_prompt,
                  motion_prompt: result.motion_prompt,
                }
              : s,
          ),
        };
      });
      setOpenInstructionIndex(null);
      setInstructionText("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to regenerate shot");
    } finally {
      setRegeneratingIndex(null);
    }
  };

  if (loadError)
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="rw-error" style={{ marginTop: 48 }}>
          <strong>Error:</strong> {loadError}
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

  if (!plan)
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div
            className="rw-skeleton"
            style={{ height: 14, width: 100, marginBottom: 12 }}
          />
          <div
            className="rw-skeleton"
            style={{ height: 36, width: "60%", marginBottom: 8 }}
          />
          <div className="rw-skeleton" style={{ height: 18, width: "45%" }} />
        </div>
        <div className="rw-card" style={{ padding: 24, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <span className="rw-spinner" />
            <span style={{ fontSize: "0.875rem", color: "var(--fg-muted)" }}>
              Generating video plan…
            </span>
          </div>
          {[80, 65, 55].map((w, i) => (
            <div
              key={i}
              className="rw-skeleton"
              style={{ height: 14, width: `${w}%`, marginBottom: 10 }}
            />
          ))}
        </div>
        {[1, 2, 3].map((k) => (
          <div
            key={k}
            className="rw-card"
            style={{ padding: 20, marginBottom: 12 }}
          >
            <div
              className="rw-skeleton"
              style={{ height: 16, width: "40%", marginBottom: 10 }}
            />
            <div
              className="rw-skeleton"
              style={{ height: 13, width: "75%", marginBottom: 6 }}
            />
            <div className="rw-skeleton" style={{ height: 13, width: "55%" }} />
          </div>
        ))}
      </div>
    );

  const currentPlan = localPlan ?? plan;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
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
          Step 3 — Plan Review
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
          Your video plan
        </h1>
        <p
          style={{
            color: "var(--fg-muted)",
            fontSize: "0.9375rem",
            lineHeight: 1.5,
          }}
        >
          Review the plan and direct the agent before we generate the shots.
        </p>
      </div>

      {/* Hook */}
      <div className="rw-card" style={{ padding: 24, marginBottom: 16 }}>
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
          Hook
        </p>
        <p
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--fg)",
            lineHeight: 1.5,
          }}
        >
          "{currentPlan?.hook}"
        </p>
      </div>

      {/* Shot cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {currentPlan?.shots.map((shot, i) => (
          <div
            key={i}
            className="rw-card"
            style={{
              padding: 20,
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent-grad)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {shot.index + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <p
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    color: "var(--fg)",
                  }}
                >
                  {shot.description}
                </p>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--fg-dim)",
                    flexShrink: 0,
                    marginLeft: 12,
                  }}
                >
                  {shot.duration_seconds}s
                </span>
              </div>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--fg-muted)",
                  lineHeight: 1.4,
                }}
              >
                {shot.image_prompt}
              </p>
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border)",
                }}
              >
                {openInstructionIndex !== shot.index ? (
                  <button
                    onClick={() => {
                      setOpenInstructionIndex(shot.index);
                      setInstructionText("");
                    }}
                    disabled={regeneratingIndex !== null}
                    style={{
                      background: "none",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "6px 12px",
                      cursor:
                        regeneratingIndex !== null ? "not-allowed" : "pointer",
                      color: "var(--fg-muted)",
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      opacity: regeneratingIndex !== null ? 0.5 : 1,
                    }}
                  >
                    <span>🔁</span> Direct this shot
                  </button>
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <textarea
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      placeholder="Tell the agent how to revise this shot — e.g., 'make it more dramatic with golden hour lighting'"
                      rows={2}
                      autoFocus
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--fg)",
                        fontSize: "0.8125rem",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => {
                          setOpenInstructionIndex(null);
                          setInstructionText("");
                        }}
                        disabled={regeneratingIndex === shot.index}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--fg-dim)",
                          cursor: "pointer",
                          fontSize: "0.8125rem",
                          padding: "6px 12px",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() =>
                          handleRegenerateShot(shot.index, instructionText)
                        }
                        disabled={
                          !instructionText.trim() || regeneratingIndex !== null
                        }
                        className="rw-btn-primary"
                        style={{ fontSize: "0.8125rem", padding: "6px 14px" }}
                      >
                        {regeneratingIndex === shot.index ? (
                          <>
                            <span
                              className="rw-spinner"
                              style={{
                                width: 12,
                                height: 12,
                                borderWidth: 1.5,
                              }}
                            />
                            Revising…
                          </>
                        ) : (
                          "Send"
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Voiceover + music */}
      <div className="rw-card" style={{ padding: 24, marginBottom: 24 }}>
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
          Voiceover script
        </p>
        <p
          style={{
            fontSize: "0.9rem",
            color: "var(--fg-muted)",
            lineHeight: 1.6,
            marginBottom: 16,
            fontStyle: "italic",
          }}
        >
          "{currentPlan?.voiceover_script}"
        </p>
        {currentPlan?.music_feel && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--fg-dim)" }}>
              Music feel:
            </span>
            <span className="rw-badge rw-badge-violet">
              {currentPlan.music_feel}
            </span>
          </div>
        )}
      </div>

      {/* Direction textarea */}
      <div className="rw-card" style={{ padding: 24, marginBottom: 24 }}>
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
          Direct the agent
        </p>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--fg-muted)",
            marginBottom: 14,
          }}
        >
          Tell the agent how to revise the plan. Changes take effect instantly.
        </p>
        <textarea
          id="direction-input"
          className="rw-textarea"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="e.g. Make the hook more urgent and focus shot 2 on the shoe sole texture"
          disabled={directing}
        />
        {directError && (
          <div className="rw-error" style={{ marginTop: 10 }}>
            {directError}
          </div>
        )}
        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}
        >
          <button
            id="apply-direction-btn"
            className="rw-btn-secondary"
            onClick={handleDirect}
            disabled={directing || !direction.trim()}
          >
            {directing ? (
              <>
                <span
                  className="rw-spinner"
                  style={{ width: 14, height: 14, borderWidth: 2 }}
                />
                Applying…
              </>
            ) : (
              "Apply direction"
            )}
          </button>
        </div>

        {/* Applied directions */}
        {directions.length > 0 && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--fg-dim)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Recent directions
            </p>
            {directions.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{ fontSize: "0.8125rem", color: "var(--fg-muted)" }}
                >
                  {d.text}
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: "0.75rem", color: "var(--fg-dim)" }}>
                    {d.ts}
                  </span>
                  <span className="rw-badge rw-badge-green">Applied</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          id="generate-video-btn"
          className="rw-btn-primary"
          onClick={handleContinue}
          disabled={continuing}
        >
          {continuing ? (
            <>
              <span
                className="rw-spinner"
                style={{ width: 16, height: 16, borderWidth: 2 }}
              />
              Starting generation…
            </>
          ) : (
            <>
              Generate the video{" "}
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
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function PlanPage() {
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
          <PlanInner />
        </Suspense>
      </main>
    </div>
  );
}
