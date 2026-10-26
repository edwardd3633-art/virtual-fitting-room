import { type SavedLook, LookParseError, parseLook } from "@/domain/looks";
import type { KeyValueStorage } from "./profileStore";

/**
 * Saved looks persistence. Synchronous because it wraps localStorage; an
 * account-backed version would sit behind the same methods.
 */
export const LOOKS_STORAGE_KEY = "vfr.savedLooks.v1";

export class LocalLooksStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly onCorrupt: (err: unknown) => void = () => {},
  ) {}

  list(): SavedLook[] {
    const raw = this.storage.getItem(LOOKS_STORAGE_KEY);
    if (!raw) return [];
    let arr: unknown;
    try {
      arr = JSON.parse(raw);
    } catch (err) {
      this.onCorrupt(err);
      return [];
    }
    if (!Array.isArray(arr)) return [];
    const out: SavedLook[] = [];
    for (const item of arr) {
      try {
        out.push(parseLook(item));
      } catch (err) {
        if (!(err instanceof LookParseError)) throw err;
        this.onCorrupt(err);
      }
    }
    // Newest first.
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  private write(looks: SavedLook[]): void {
    if (looks.length === 0) this.storage.removeItem(LOOKS_STORAGE_KEY);
    else this.storage.setItem(LOOKS_STORAGE_KEY, JSON.stringify(looks));
  }

  add(look: SavedLook): void {
    this.write([look, ...this.list().filter((l) => l.id !== look.id)]);
  }

  remove(id: string): void {
    this.write(this.list().filter((l) => l.id !== id));
  }

  clear(): void {
    this.storage.removeItem(LOOKS_STORAGE_KEY);
  }
}
