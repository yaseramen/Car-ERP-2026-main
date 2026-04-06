"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const SEEN_KEY = "alameen-release-notifs-seen";

function releaseNotificationIdsFromPayload(data: unknown): string[] {
  if (!data || typeof data !== "object" || !("notifications" in data)) return [];
  const raw = (data as { notifications?: unknown }).notifications;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const n of raw) {
    if (n && typeof n === "object" && "id" in n) {
      const id = (n as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
  }
  return ids;
}

function getSeenIds(): Set<string> {
  try {
    const s = localStorage.getItem(SEEN_KEY);
    if (!s) return new Set();
    const a = JSON.parse(s) as unknown;
    return new Set(Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function markSeen(ids: string[]) {
  try {
    const prev = getSeenIds();
    ids.forEach((id) => prev.add(id));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...prev]));
  } catch {
    /* ignore */
  }
}

export function ReleaseNotesBanner() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/help/release-notifications");
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.notifications) ? data.notifications : [];
      const seen = getSeenIds();
      const unseen = list.filter((n: { id?: string }) => n.id && !seen.has(n.id));
      setCount(unseen.length);
      setOpen(unseen.length > 0);
    } catch {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  function dismissAll() {
    fetch("/api/admin/help/release-notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        markSeen(releaseNotificationIdsFromPayload(data));
        setOpen(false);
        setCount(0);
      })
      .catch(() => setOpen(false));
  }

  if (!open || count === 0) return null;

  return (
    <div
      className="no-print border-b border-emerald-200 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/40 px-3 sm:px-4 py-2.5 text-sm text-emerald-900 dark:text-emerald-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2"
      dir="rtl"
    >
      <span>
        يوجد <strong>{count}</strong> تحديثاً جديداً في البرنامج. يمكنك تفعيل إشعارات المتصفح من الشريط الجانبي لاستلام تنبيهات الميزات تلقائياً.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/admin/help"
          className="font-medium text-emerald-800 dark:text-emerald-200 underline underline-offset-2"
          onClick={() => {
            fetch("/api/admin/help/release-notifications")
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                markSeen(releaseNotificationIdsFromPayload(data));
              })
              .catch(() => {});
          }}
        >
          عرض الدليل وما الجديد
        </Link>
        <button
          type="button"
          onClick={dismissAll}
          className="px-2 py-1 rounded-md text-xs border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
        >
          تجاهل
        </button>
      </div>
    </div>
  );
}
