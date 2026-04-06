/**
 * واجهات تخزين آمنة لمتصفحات فيسبوك وإنستغرام
 * حيث قد يفشل localStorage/sessionStorage أو يتصرف بشكل غير متوقع
 */
function safeStorage<T>(storage: Storage | null, key: string): T | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeStorageString(storage: Storage | null, key: string): string | null {
  try {
    if (!storage) return null;
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function setSafeStorage(storage: Storage | null, key: string, value: string): void {
  try {
    if (!storage) return;
    storage.setItem(key, value);
  } catch {}
}

export function getLocalStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  return safeStorage<T>(window.localStorage, key);
}

export function getLocalStorageString(key: string): string | null {
  if (typeof window === "undefined") return null;
  return safeStorageString(window.localStorage, key);
}

export function setLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  setSafeStorage(window.localStorage, key, value);
}

export function getSessionStorageString(key: string): string | null {
  if (typeof window === "undefined") return null;
  return safeStorageString(window.sessionStorage, key);
}

export function setSessionStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  setSafeStorage(window.sessionStorage, key, value);
}

/** هل المتصفح هو متصفح فيسبوك أو إنستغرام الداخلي؟ */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return !!(/FBAN|FBAV|FB_IAB|FB4A|FBIOS/i.test(ua) || /Instagram/i.test(ua));
}
