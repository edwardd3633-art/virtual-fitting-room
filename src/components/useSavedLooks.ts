"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { SavedLook } from "@/domain/looks";
import { LOOKS_STORAGE_KEY, LocalLooksStore } from "@/adapters/storage/looksStore";

/**
 * Shared saved-looks state for every component on the page. Snapshots are
 * cached so React sees a stable value until something is written, and
 * changes made in another tab arrive through the `storage` event.
 */
let store: LocalLooksStore | null | undefined;
let snapshot: SavedLook[] | null = null;
const listeners = new Set<() => void>();

function getStore(): LocalLooksStore | null {
  if (store !== undefined) return store;
  try {
    store = new LocalLooksStore(window.localStorage, (err) => console.warn("Ignoring unreadable saved look", err));
  } catch {
    store = null;
  }
  return store;
}

function refresh() {
  snapshot = getStore()?.list() ?? [];
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOOKS_STORAGE_KEY || e.key === null) refresh();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): SavedLook[] {
  if (snapshot === null) snapshot = getStore()?.list() ?? [];
  return snapshot;
}

/** Null on the server and during hydration, so callers can tell "loading" from "none saved". */
const getServerSnapshot = (): SavedLook[] | null => null;

export function useSavedLooks() {
  const looks = useSyncExternalStore<SavedLook[] | null>(subscribe, getSnapshot, getServerSnapshot);
  const add = useCallback((look: SavedLook) => {
    const s = getStore();
    if (!s) throw new Error("Saving isn't available in this browser.");
    s.add(look);
    refresh();
  }, []);

  const remove = useCallback((id: string) => {
    getStore()?.remove(id);
    refresh();
  }, []);

  const clear = useCallback(() => {
    getStore()?.clear();
    refresh();
  }, []);

  return { looks, add, remove, clear };
}
