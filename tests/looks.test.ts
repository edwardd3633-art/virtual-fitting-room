import { describe, expect, it } from "vitest";
import { createProfile } from "@/domain/avatar";
import { LookParseError, buildDataExport, createLook, parseLook, sameLook } from "@/domain/looks";
import { LOOKS_STORAGE_KEY, LocalLooksStore } from "@/adapters/storage/looksStore";
import { MemoryStorage } from "@/adapters/storage/profileStore";

const now = new Date("2026-10-26T12:00:00Z");
const look = (id: string, size = "M", compare: string | null = null, at = now) =>
  createLook({ id, productId: "demo-relaxed-tee", variantId: "ecru", sizeLabel: size, compareSizeLabel: compare, now: at });

describe("saved looks", () => {
  it("round-trips through parseLook", () => {
    const l = look("a", "M", "S");
    expect(parseLook(JSON.parse(JSON.stringify(l)))).toEqual(l);
  });

  it("treats M-vs-S and S-vs-M as the same comparison", () => {
    expect(sameLook(look("a", "M", "S"), look("b", "S", "M"))).toBe(true);
    expect(sameLook(look("a", "M"), look("b", "M", "S"))).toBe(false);
    expect(sameLook(look("a", "M"), { ...look("b", "M"), variantId: "navy" })).toBe(false);
  });

  it.each([
    ["a non-object", "nope"],
    ["the wrong version", { ...look("a"), schemaVersion: 2 }],
    ["a missing size", { ...look("a"), sizeLabel: "" }],
    ["a bad compare size", { ...look("a"), compareSizeLabel: 3 }],
  ])("rejects %s", (_l, data) => {
    expect(() => parseLook(data)).toThrow(LookParseError);
  });
});

describe("LocalLooksStore", () => {
  it("adds, lists newest first, removes and clears", () => {
    const storage = new MemoryStorage();
    const store = new LocalLooksStore(storage);
    store.add(look("old", "S", null, new Date("2026-10-01T00:00:00Z")));
    store.add(look("new", "M"));
    expect(store.list().map((l) => l.id)).toEqual(["new", "old"]);
    store.remove("new");
    expect(store.list().map((l) => l.id)).toEqual(["old"]);
    store.clear();
    expect(store.list()).toEqual([]);
    expect(storage.getItem(LOOKS_STORAGE_KEY)).toBeNull();
  });

  it("skips corrupt entries instead of failing", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOOKS_STORAGE_KEY, JSON.stringify([look("ok"), { id: "bad" }]));
    let corrupt = 0;
    expect(new LocalLooksStore(storage, () => corrupt++).list().map((l) => l.id)).toEqual(["ok"]);
    expect(corrupt).toBe(1);
  });
});

describe("data export (PRD §8)", () => {
  it("includes every avatar and saved look and says where data lives", () => {
    const avatar = createProfile({ id: "p1", now });
    const data = buildDataExport({ avatars: [avatar], savedLooks: [look("a")], now });
    expect(data).toMatchObject({ format: "virtual-fitting-room/data-export", version: 1, exportedAt: now.toISOString() });
    expect(data.avatars).toEqual([avatar]);
    expect(data.savedLooks).toHaveLength(1);
    expect(data.storedWhere).toMatch(/this browser/i);
  });
});
