export interface HealthResponse {
  status: string;
  service: string;
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8084";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(new URL("/health", API_BASE_URL));

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}.`);
  }

  return (await response.json()) as HealthResponse;
}
