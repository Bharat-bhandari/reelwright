"use client";

import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchHealth, type HealthResponse } from "@/lib/api";

type LoadState = "loading" | "ready" | "error";

export default function Home() {
  const [state, setState] = useState<LoadState>("loading");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const loadHealth = async () => {
      try {
        const response = await fetchHealth();
        if (!isMounted) {
          return;
        }

        setHealth(response);
        setState("ready");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unable to reach the backend health endpoint.",
        );
        setState("error");
      }
    };

    void loadHealth();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-3xl space-y-6">
        <section className="space-y-3 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Reelwright
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Turn a product URL into a short-form video ad.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            The frontend is wired to the backend health endpoint so you can
            verify the stack before adding any domain logic.
          </p>
        </section>

        <Card className="border-slate-200/80 bg-white/85 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">
              Backend status
            </CardTitle>
            <CardDescription className="text-slate-600">
              Fetching{" "}
              <span className="font-medium">
                {process.env.NEXT_PUBLIC_API_BASE_URL ??
                  "http://localhost:8084"}
              </span>
              /health
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state === "loading" ? (
              <p className="text-sm text-slate-600">Checking connection...</p>
            ) : null}

            {state === "error" ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </p>
            ) : null}

            {state === "ready" && health ? (
              <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 px-4 py-4 text-sm leading-6 text-slate-100">
                {JSON.stringify(health, null, 2)}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
