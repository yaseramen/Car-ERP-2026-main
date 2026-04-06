"use client";

import { useEffect } from "react";

/**
 * اختصارات لوحة المفاتيح:
 * - Ctrl+S / Cmd+S: حفظ
 * - Escape: إغلاق
 */
export function useKeyboardShortcut(options: {
  onSave?: () => void;
  onEscape?: () => void;
  enabled?: boolean;
}) {
  const { onSave, onEscape, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSave?.();
      } else if (e.key === "Escape") {
        onEscape?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onSave, onEscape]);
}
