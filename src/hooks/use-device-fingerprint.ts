"use client";

import { useState, useEffect } from "react";

export function useDeviceFingerprint(): string | null {
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const FingerprintJS = (await import("@fingerprintjs/fingerprintjs")).default;
        const fp = await FingerprintJS.load({ monitoring: false });
        const result = await fp.get();
        if (!cancelled && result.visitorId) {
          setFingerprint(result.visitorId);
        }
      } catch {
        if (!cancelled) setFingerprint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return fingerprint;
}
