/**
 * Persistence contract for `createAlfadocsAuth` (`storage` option).
 * Implement `AuthStorage` in a new module (e.g. `my-bridge`) to swap Supabase for another backend.
 */

export interface StoredUser {
  id: string;
  username: string;
  authData: Record<string, unknown>;
}

export interface StoredSession {
  userId: string;
  cookieValue: string;
  /** Unix epoch milliseconds when the session should be treated as expired. */
  expiresAt: number;
}

export interface UserStore {
  /**
   * Looks a user up by the STORAGE id — the `StoredUser.id` your own
   * `createUser` / `getSession` round-trip. Called on the session path.
   */
  getUser(userId: string): Promise<StoredUser | null>;
  /**
   * Looks a user up by the EXTERNAL id — the AlfaDocs user id from the OAuth
   * profile. Called on the callback (find-or-create) path. If your bridge uses
   * the external id as its storage id, implement this identically to `getUser`;
   * if it keeps separate columns, query the external-id column here.
   */
  getUserByExternalId(externalId: string): Promise<StoredUser | null>;
  /**
   * Creates a new user using a caller-provided canonical (external) id.
   * Keeping the id explicit makes bridge implementations predictable.
   */
  createUser(userId: string, username: string, authData: Record<string, unknown>): Promise<StoredUser>;
  updateUser(
    userId: string,
    fieldsToUpdate: Partial<Pick<StoredUser, "username" | "authData">>,
  ): Promise<StoredUser>;
}

export interface SessionStore {
  createSession(userId: string): Promise<StoredSession>;
  getSession(cookieValue: string): Promise<StoredSession | null>;
  deleteSession(cookieValue: string): Promise<void>;
}

export type AuthStorage = UserStore & SessionStore;
