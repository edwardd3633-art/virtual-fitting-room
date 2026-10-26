import { type AvatarProfile, ProfileParseError, parseProfile, serializeProfile } from "@/domain/avatar";

/**
 * Avatar persistence boundary (FR-002–FR-006).
 *
 * The MVP uses `LocalProfileStore` (browser-only, no account). An
 * account-backed store (e.g. Supabase with row-level security so customers
 * can only read their own rows) implements the same interface; migrating is a
 * matter of reading local profiles and saving them through the new store.
 */
export interface ProfileStore {
  readonly kind: "local" | "remote";
  list(): Promise<AvatarProfile[]>;
  get(id: string): Promise<AvatarProfile | null>;
  save(profile: AvatarProfile): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Minimal Storage subset so tests can pass an in-memory implementation. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LOCAL_STORAGE_KEY = "vfr.avatarProfiles.v1";

export class LocalProfileStore implements ProfileStore {
  readonly kind = "local" as const;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly onCorrupt: (err: unknown) => void = () => {},
  ) {}

  private readAll(): AvatarProfile[] {
    const raw = this.storage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    let arr: unknown;
    try {
      arr = JSON.parse(raw);
    } catch (err) {
      this.onCorrupt(err);
      return [];
    }
    if (!Array.isArray(arr)) return [];
    const out: AvatarProfile[] = [];
    for (const item of arr) {
      try {
        out.push(parseProfile(item));
      } catch (err) {
        if (!(err instanceof ProfileParseError)) throw err;
        this.onCorrupt(err);
      }
    }
    return out;
  }

  private writeAll(profiles: AvatarProfile[]): void {
    if (profiles.length === 0) {
      this.storage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    this.storage.setItem(LOCAL_STORAGE_KEY, `[${profiles.map(serializeProfile).join(",")}]`);
  }

  async list(): Promise<AvatarProfile[]> {
    return this.readAll();
  }

  async get(id: string): Promise<AvatarProfile | null> {
    return this.readAll().find((p) => p.id === id) ?? null;
  }

  async save(profile: AvatarProfile): Promise<void> {
    const all = this.readAll().filter((p) => p.id !== profile.id);
    all.push(profile);
    this.writeAll(all);
  }

  async delete(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((p) => p.id !== id));
  }
}

export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}
