/**
 * React binding for the @alfadocs/auth BFF.
 *
 * The auth *core* (`createAlfadocsAuth`) is a server-side handler: it owns the
 * client secret, runs the PKCE code-exchange, and sets an httpOnly session
 * cookie. None of that can live in the browser. This binding is the browser
 * client of that handler's HTTP surface:
 *
 *   GET  {basePath}/login   → 302 to the AlfaDocs OAuth server (BFF does PKCE)
 *   GET  {basePath}/callback → BFF exchanges the code, sets the session cookie
 *   GET  {basePath}/session → { authenticated, user } | { authenticated: false }
 *   POST {basePath}/logout  → clears the cookie + invalidates the session
 *
 * So `connect()` is a full-page navigation to `/login` (the OAuth redirect can't
 * be an XHR), and auth state is read by fetching `/session` with credentials.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Lifecycle of the session check. */
export type AlfadocsAuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

/**
 * The authenticated user. Shape is whatever the BFF's `resolveProfile` /
 * `/api/v1/me` returns (persisted as the session `authData`), so it's an open
 * record — consumers narrow it to their own profile type.
 */
export type AlfadocsAuthUser = Record<string, unknown>;

export interface AlfadocsAuthContextValue {
  /** Current session-check lifecycle state. */
  status: AlfadocsAuthStatus;
  /** The authenticated user, or `null` when not authenticated / still loading. */
  user: AlfadocsAuthUser | null;
  /** Last error message from a failed `/session` or `/logout`, else `null`. */
  error: string | null;
  /** Convenience flag — `status === 'authenticated'`. */
  isAuthenticated: boolean;
  /**
   * Start the OAuth login: full-page navigation to the BFF `/login` endpoint,
   * which redirects to the AlfaDocs OAuth server. Not an XHR — the browser
   * must follow the redirect.
   */
  connect: () => void;
  /** POST `/logout`, then re-read the session. */
  signOut: () => Promise<void>;
  /** Re-fetch `/session` and update state. */
  refresh: () => Promise<void>;
}

const AlfadocsAuthContext = createContext<AlfadocsAuthContextValue | null>(null);

export interface AlfadocsAuthProviderProps {
  /**
   * Base path (or absolute origin + path) where the @alfadocs/auth BFF handler
   * is mounted. The binding calls `{basePath}/session`, `{basePath}/login`,
   * `{basePath}/logout`. Default: `'/api/auth'`.
   */
  basePath?: string;
  /**
   * Custom `fetch` implementation — primarily for testing. Defaults to the
   * global `fetch`. Always called with `credentials: 'include'` so the session
   * cookie is sent (works same-origin and cross-origin when the BFF enables
   * credentialed CORS).
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Navigation used by `connect()`. Defaults to assigning `window.location`.
   * Override in tests or custom-router setups.
   */
  navigate?: (url: string) => void;
  /** Skip the automatic `/session` check on mount (default `false`). */
  skipInitialCheck?: boolean;
  children: ReactNode;
}

interface SessionResponse {
  authenticated: boolean;
  user?: AlfadocsAuthUser;
  error?: string;
}

function joinPath(basePath: string, segment: string): string {
  return `${basePath.replace(/\/$/, '')}/${segment}`;
}

export function AlfadocsAuthProvider({
  basePath = '/api/auth',
  fetch: fetchImpl,
  navigate,
  skipInitialCheck = false,
  children,
}: AlfadocsAuthProviderProps) {
  const [status, setStatus] = useState<AlfadocsAuthStatus>(
    skipInitialCheck ? 'unauthenticated' : 'loading',
  );
  const [user, setUser] = useState<AlfadocsAuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable refs so the callbacks below don't re-create on every prop identity
  // change and retrigger the mount effect.
  const doFetch = fetchImpl ?? globalThis.fetch;
  const basePathRef = useRef(basePath);
  basePathRef.current = basePath;
  const fetchRef = useRef(doFetch);
  fetchRef.current = doFetch;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchRef.current(
        joinPath(basePathRef.current, 'session'),
        { credentials: 'include', headers: { accept: 'application/json' } },
      );
      const body = (await res.json()) as SessionResponse;
      if (body.authenticated && body.user) {
        setUser(body.user);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus(body.error ? 'error' : 'unauthenticated');
        if (body.error) setError(body.error);
      }
    } catch (err) {
      setUser(null);
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const connect = useCallback(() => {
    const url = joinPath(basePathRef.current, 'login');
    if (navigate) {
      navigate(url);
    } else if (typeof window !== 'undefined') {
      window.location.assign(url);
    }
  }, [navigate]);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await fetchRef.current(joinPath(basePathRef.current, 'logout'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (skipInitialCheck) return;
    void refresh();
  }, [skipInitialCheck, refresh]);

  const value = useMemo<AlfadocsAuthContextValue>(
    () => ({
      status,
      user,
      error,
      isAuthenticated: status === 'authenticated',
      connect,
      signOut,
      refresh,
    }),
    [status, user, error, connect, signOut, refresh],
  );

  return (
    <AlfadocsAuthContext.Provider value={value}>
      {children}
    </AlfadocsAuthContext.Provider>
  );
}

/**
 * Access the AlfaDocs auth state and actions. Must be called inside an
 * `<AlfadocsAuthProvider>`.
 */
export function useAlfadocsAuth(): AlfadocsAuthContextValue {
  const ctx = useContext(AlfadocsAuthContext);
  if (!ctx) {
    throw new Error(
      'useAlfadocsAuth must be used within an <AlfadocsAuthProvider>.',
    );
  }
  return ctx;
}
