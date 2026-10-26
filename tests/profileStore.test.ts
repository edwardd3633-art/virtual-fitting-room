import { describe, expect, it, vi } from "vitest";
import { createProfile } from "@/domain/avatar";
import { LOCAL_STORAGE_KEY, LocalProfileStore, MemoryStorage } from "@/adapters/storage/profileStore";

describe("LocalProfileStore", () => {
  it("saves, loads, updates and deletes (FR-002/004/006)", async () => {
    const storage = new MemoryStorage();
    const store = new LocalProfileStore(storage);
    const p = createProfile({ id: "a1" });

    expect(await store.list()).toEqual([]);
    await store.save(p);
    expect(await store.get("a1")).toEqual(p);

    await store.save({ ...p, name: "Renamed" });
    expect(await store.list()).toHaveLength(1);
    expect((await store.get("a1"))!.name).toBe("Renamed");

    await store.delete("a1");
    expect(await store.get("a1")).toBeNull();
    expect(storage.getItem(LOCAL_STORAGE_KEY)).toBeNull();
  });

  it("deleting one profile keeps others", async () => {
    const store = new LocalProfileStore(new MemoryStorage());
    await store.save(createProfile({ id: "a" }));
    await store.save(createProfile({ id: "b" }));
    await store.delete("a");
    expect((await store.list()).map((p) => p.id)).toEqual(["b"]);
  });

  it("survives corrupt storage and reports it", async () => {
    const storage = new MemoryStorage();
    const onCorrupt = vi.fn();
    storage.setItem(LOCAL_STORAGE_KEY, "not json");
    expect(await new LocalProfileStore(storage, onCorrupt).list()).toEqual([]);
    expect(onCorrupt).toHaveBeenCalledOnce();
  });

  it("skips individual invalid entries", async () => {
    const storage = new MemoryStorage();
    const good = createProfile({ id: "ok" });
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([good, { id: "bad" }]));
    const list = await new LocalProfileStore(storage).list();
    expect(list).toEqual([good]);
  });
});
