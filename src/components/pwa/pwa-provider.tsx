"use client";

import { useEffect } from "react";
import { PwaInstallBanner } from "./install-banner";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.update())
      .catch(() => {});
  }, []);

  return (
    <>
      {children}
      <PwaInstallBanner />
    </>
  );
}
