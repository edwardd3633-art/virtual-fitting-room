"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AvatarProfile } from "@/domain/avatar";
import { LocalProfileStore, type ProfileStore } from "@/adapters/storage/profileStore";

interface ProfileContextValue {
  status: "loading" | "ready" | "error";
  /** P0 supports one avatar per browser; the store already supports several (FR-007). */
  profile: AvatarProfile | null;
  storeKind: ProfileStore["kind"];
  save(profile: AvatarProfile): Promise<void>;
  remove(): Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

function createStore(): ProfileStore | null {
  try {
    return new LocalProfileStore(window.localStorage, (err) => console.warn("Ignoring unreadable saved avatar", err));
  } catch {
    // localStorage can be unavailable (private mode, blocked site data).
    return null;
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<ProfileStore | null>(null);
  const [status, setStatus] = useState<ProfileContextValue["status"]>("loading");
  const [profile, setProfile] = useState<AvatarProfile | null>(null);

  useEffect(() => {
    const s = createStore();
    if (!s) {
      setStatus("error");
      return;
    }
    setStore(s);
    s.list()
      .then((all) => {
        setProfile(all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const save = useCallback(
    async (p: AvatarProfile) => {
      if (!store) throw new Error("Saving isn't available in this browser.");
      await store.save(p);
      setProfile(p);
    },
    [store],
  );

  const remove = useCallback(async () => {
    if (!store || !profile) return;
    await store.delete(profile.id);
    setProfile(null);
  }, [store, profile]);

  const value = useMemo<ProfileContextValue>(
    () => ({ status, profile, storeKind: store?.kind ?? "local", save, remove }),
    [status, profile, store, save, remove],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
