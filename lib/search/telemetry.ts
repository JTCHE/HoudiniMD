"use client";

type Event =
  | { event: "search"; query: string; results: number; source: "overlay" }
  | { event: "click"; query: string; path: string; rank: number };

function send(event: Event): void {
  try {
    navigator.sendBeacon("/api/telemetry", new Blob([JSON.stringify(event)], { type: "application/json" }));
  } catch {
    // Analytics must never affect search or navigation.
  }
}

export function recordSearch(query: string, results: number): void {
  if (query) send({ event: "search", query, results, source: "overlay" });
}

export function recordSearchClick(query: string, path: string, rank: number): void {
  if (query && path && rank > 0) send({ event: "click", query, path, rank });
}
