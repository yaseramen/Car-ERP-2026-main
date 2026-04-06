"use client";

import { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import {
  FEEDBACK_SUPER_PENDING_BASELINE_KEY,
  FEEDBACK_USER_UNREAD_BASELINE_KEY,
  WALLET_TOPUP_SUPER_PENDING_BASELINE_KEY,
  WALLET_TOPUP_TENANT_UNACK_BASELINE_KEY,
} from "@/lib/feedback-notification-keys";

type Summary = {
  lowStockCount: number;
  pendingInvoices: { count: number; remaining: number };
};

type NotificationsContextType = {
  requestPermission: () => Promise<NotificationPermission>;
  permission: NotificationPermission | null;
};

const NotificationsContext = createContext<NotificationsContextType | null>(null);

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = "alameen-notifications-last";
const RELEASE_SEEN_KEY = "alameen-release-notifs-seen";
const MAX_RELEASE_TOASTS = 5;

type ReleaseNotifPayload = { id: string; title: string; body: string; link?: string };

function getLastNotified(): Summary {
  if (typeof window === "undefined") return { lowStockCount: 0, pendingInvoices: { count: 0, remaining: 0 } };
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return { lowStockCount: 0, pendingInvoices: { count: 0, remaining: 0 } };
    const parsed = JSON.parse(s) as Summary;
    return {
      lowStockCount: parsed.lowStockCount ?? 0,
      pendingInvoices: {
        count: parsed.pendingInvoices?.count ?? 0,
        remaining: parsed.pendingInvoices?.remaining ?? 0,
      },
    };
  } catch {
    return { lowStockCount: 0, pendingInvoices: { count: 0, remaining: 0 } };
  }
}

function setLastNotified(summary: Summary) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {}
}

function getSeenReleaseIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const s = localStorage.getItem(RELEASE_SEEN_KEY);
    if (!s) return [];
    const parsed = JSON.parse(s) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function getFeedbackSuperBaseline(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(FEEDBACK_SUPER_PENDING_BASELINE_KEY);
    if (s == null) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function setFeedbackSuperBaseline(n: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEEDBACK_SUPER_PENDING_BASELINE_KEY, String(n));
  } catch {}
}

function getFeedbackUserBaseline(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(FEEDBACK_USER_UNREAD_BASELINE_KEY);
    if (s == null) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function setFeedbackUserBaseline(n: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEEDBACK_USER_UNREAD_BASELINE_KEY, String(n));
  } catch {}
}

function getWalletTopupSuperBaseline(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(WALLET_TOPUP_SUPER_PENDING_BASELINE_KEY);
    if (s == null) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function setWalletTopupSuperBaseline(n: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WALLET_TOPUP_SUPER_PENDING_BASELINE_KEY, String(n));
  } catch {}
}

function getWalletTopupTenantUnackBaseline(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(WALLET_TOPUP_TENANT_UNACK_BASELINE_KEY);
    if (s == null) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function setWalletTopupTenantUnackBaseline(n: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WALLET_TOPUP_TENANT_UNACK_BASELINE_KEY, String(n));
  } catch {}
}

function markReleaseSeen(ids: string[]) {
  if (typeof window === "undefined" || ids.length === 0) return;
  try {
    const prev = new Set(getSeenReleaseIds());
    ids.forEach((id) => prev.add(id));
    localStorage.setItem(RELEASE_SEEN_KEY, JSON.stringify([...prev]));
  } catch {}
}

function showReleaseNotifications(list: ReleaseNotifPayload[]) {
  if (!("Notification" in window) || Notification.permission !== "granted" || list.length === 0) return;
  const seen = new Set(getSeenReleaseIds());
  const unseen = list.filter((n) => n.id && !seen.has(n.id));
  if (unseen.length === 0) return;

  const toShow = unseen.slice(0, MAX_RELEASE_TOASTS);
  const ids = toShow.map((n) => n.id);

  toShow.forEach((n, i) => {
    window.setTimeout(() => {
      try {
        new Notification(`جديد في EFCT: ${n.title}`, {
          body: n.body.slice(0, 280) + (n.body.length > 280 ? "…" : ""),
          icon: "/icon.svg",
          tag: `efct-release-${n.id}`,
        });
      } catch {
        /* ignore */
      }
    }, i * 900);
  });

  window.setTimeout(() => markReleaseSeen(ids), toShow.length * 900 + 400);
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : null
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAndNotify = useCallback(async () => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const [summaryRes, releaseRes, fbSuperRes, fbUserRes, wtSuperRes, wtTenantRes] = await Promise.all([
        fetch("/api/admin/reports/summary"),
        fetch("/api/admin/help/release-notifications"),
        fetch("/api/admin/feedback/notify-summary"),
        fetch("/api/feedback/notify-summary"),
        fetch("/api/admin/wallets/topup-notify-summary-super"),
        fetch("/api/admin/wallets/topup-notify-summary"),
      ]);

      if (releaseRes.ok) {
        const rel = await releaseRes.json();
        const list = Array.isArray(rel.notifications) ? (rel.notifications as ReleaseNotifPayload[]) : [];
        showReleaseNotifications(list);
      }

      if (fbSuperRes.ok) {
        const fb = await fbSuperRes.json();
        const pendingCount = Number(fb.pendingCount ?? 0);
        if (Number.isFinite(pendingCount)) {
          const baseline = getFeedbackSuperBaseline();
          if (baseline === null) {
            setFeedbackSuperBaseline(pendingCount);
          } else {
            if (pendingCount > baseline) {
              const delta = pendingCount - baseline;
              try {
                new Notification("EFCT — ملاحظات للمطور", {
                  body:
                    delta === 1
                      ? "ملاحظة جديدة بانتظار المراجعة في صندوق ملاحظات المطور."
                      : `${delta} ملاحظات جديدة بانتظار المراجعة.`,
                  icon: "/icon.svg",
                  tag: "efct-feedback-super",
                });
              } catch {
                /* ignore */
              }
              setFeedbackSuperBaseline(pendingCount);
            } else if (pendingCount < baseline) {
              setFeedbackSuperBaseline(pendingCount);
            }
          }
        }
      }

      if (fbUserRes.ok) {
        const fu = await fbUserRes.json();
        const unread = Number(fu.unreadReplyCount ?? 0);
        if (Number.isFinite(unread)) {
          const baseline = getFeedbackUserBaseline();
          if (baseline === null) {
            setFeedbackUserBaseline(unread);
          } else {
            if (unread > baseline) {
              try {
                new Notification("EFCT — رد على ملاحظتك", {
                  body: "وجدت رداً من الإدارة على إحدى ملاحظاتك. افتح «ملاحظات للمطور».",
                  icon: "/icon.svg",
                  tag: "efct-feedback-reply",
                });
              } catch {
                /* ignore */
              }
              setFeedbackUserBaseline(unread);
            } else if (unread < baseline) {
              setFeedbackUserBaseline(unread);
            }
          }
        }
      }

      if (wtSuperRes.ok) {
        const w = await wtSuperRes.json();
        const pendingCount = Number(w.pendingCount ?? 0);
        if (Number.isFinite(pendingCount)) {
          const baseline = getWalletTopupSuperBaseline();
          if (baseline === null) {
            setWalletTopupSuperBaseline(pendingCount);
          } else if (pendingCount > baseline) {
            const delta = pendingCount - baseline;
            try {
              new Notification("EFCT — طلبات شحن محفظة", {
                body:
                  delta === 1
                    ? "يوجد طلب شحن جديد بإيصال بانتظار المراجعة في المحافظ."
                    : `${delta} طلبات شحن جديدة بانتظار المراجعة في المحافظ.`,
                icon: "/icon.svg",
                tag: "efct-wallet-topup-super",
              });
            } catch {
              /* ignore */
            }
            setWalletTopupSuperBaseline(pendingCount);
          } else if (pendingCount < baseline) {
            setWalletTopupSuperBaseline(pendingCount);
          }
        }
      }

      if (wtTenantRes.ok) {
        const wt = await wtTenantRes.json();
        const unacked = Number(wt.unackedCount ?? 0);
        if (Number.isFinite(unacked)) {
          const baseline = getWalletTopupTenantUnackBaseline();
          if (baseline === null) {
            setWalletTopupTenantUnackBaseline(unacked);
          } else if (unacked > baseline) {
            try {
              new Notification("EFCT — محفظتك", {
                body:
                  unacked === 1
                    ? "تمت معالجة طلب شحن المحفظة. افتح «المحافظ» للاطلاع."
                    : `تمت معالجة ${unacked} طلبات شحن. افتح «المحافظ» للاطلاع.`,
                icon: "/icon.svg",
                tag: "efct-wallet-topup-tenant",
              });
            } catch {
              /* ignore */
            }
            setWalletTopupTenantUnackBaseline(unacked);
          } else if (unacked < baseline) {
            setWalletTopupTenantUnackBaseline(unacked);
          }
        }
      }

      if (!summaryRes.ok) return;
      const data = await summaryRes.json();
      const summary: Summary = {
        lowStockCount: data.lowStockCount ?? 0,
        pendingInvoices: data.pendingInvoices ?? { count: 0, remaining: 0 },
      };
      const last = getLastNotified();

      const lowStockNew = summary.lowStockCount > 0 && summary.lowStockCount !== last.lowStockCount;
      const pendingNew = summary.pendingInvoices.count > 0 && summary.pendingInvoices.count !== last.pendingInvoices.count;

      if (lowStockNew || pendingNew) {
        const parts: string[] = [];
        if (summary.lowStockCount > 0) parts.push(`${summary.lowStockCount} صنف ناقص`);
        if (summary.pendingInvoices.count > 0) parts.push(`${summary.pendingInvoices.count} فاتورة معلقة`);
        if (parts.length > 0) {
          new Notification("تنبيهات EFCT", {
            body: parts.join(" • "),
            icon: "/icon.svg",
            tag: "alameen-alert",
          });
          setLastNotified(summary);
        }
      }
    } catch {}
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return "denied" as NotificationPermission;
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm === "granted") {
      checkAndNotify();
      if (!intervalRef.current) {
        intervalRef.current = setInterval(checkAndNotify, POLL_INTERVAL_MS);
      }
    }
    return perm;
  }, [checkAndNotify]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      setPermission(Notification.permission);
      if (Notification.permission === "granted") {
        checkAndNotify();
        intervalRef.current = setInterval(checkAndNotify, POLL_INTERVAL_MS);
      }
    }, 0);
    return () => {
      window.clearTimeout(t);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkAndNotify]);

  return (
    <NotificationsContext.Provider value={{ requestPermission, permission }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  return ctx;
}
