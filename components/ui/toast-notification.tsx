"use client";

import { useState, useEffect } from "react";

export type ToastType = "error" | "info";

interface ToastProps {
  message: string;
  type: ToastType;
}

// Pure visual component — safe to render anywhere at root level
export function ToastNotification({ message, type }: ToastProps) {
  return (
    <div className="fixed top-4 inset-x-0 z-[60] flex justify-center pointer-events-none">
      <div
        className={`text-sm px-4 py-2 shadow-lg pointer-events-auto ${
          type === "info"
            ? "bg-muted text-foreground border border-border"
            : "bg-foreground text-background"
        }`}
      >
        {message}
      </div>
    </div>
  );
}

// Fire from anywhere — no React tree constraints
export function showToast(message: string, type: ToastType = "info") {
  window.dispatchEvent(
    new CustomEvent("houdinimd:toast", { detail: { message, type } }),
  );
}

// Mount once at root — listens for showToast() calls and renders the toast
export function ToastListener() {
  const [toast, setToast] = useState<ToastProps | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onToast(e: Event) {
      const { message, type } = (e as CustomEvent<ToastProps>).detail;
      clearTimeout(timer);
      setToast({ message, type });
      timer = setTimeout(() => setToast(null), 4000);
    }
    window.addEventListener("houdinimd:toast", onToast);
    return () => {
      window.removeEventListener("houdinimd:toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;
  return <ToastNotification message={toast.message} type={toast.type} />;
}
