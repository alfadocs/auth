// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  AlfadocsAuthProvider,
  useAlfadocsAuth,
} from '../../src/react/index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function wrapper(props: {
  fetch: typeof globalThis.fetch;
  navigate?: (url: string) => void;
  basePath?: string;
}) {
  return ({ children }: { children: ReactNode }) => (
    <AlfadocsAuthProvider
      fetch={props.fetch}
      navigate={props.navigate}
      basePath={props.basePath}
    >
      {children}
    </AlfadocsAuthProvider>
  );
}

describe('useAlfadocsAuth', () => {
  it('starts loading and resolves to authenticated with the user', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ authenticated: true, user: { email: 'a@b.com' } }),
    );
    const { result } = renderHook(() => useAlfadocsAuth(), {
      wrapper: wrapper({ fetch: fetchMock as unknown as typeof fetch }),
    });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({ email: 'a@b.com' });
    // /session called with credentials so the httpOnly cookie is sent.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('resolves to unauthenticated when the session is not authenticated', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ authenticated: false }));
    const { result } = renderHook(() => useAlfadocsAuth(), {
      wrapper: wrapper({ fetch: fetchMock as unknown as typeof fetch }),
    });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('surfaces a network error as status="error"', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const { result } = renderHook(() => useAlfadocsAuth(), {
      wrapper: wrapper({ fetch: fetchMock as unknown as typeof fetch }),
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('network down');
  });

  it('connect() navigates to the BFF /login on the configured basePath', async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn(async () => jsonResponse({ authenticated: false }));
    const { result } = renderHook(() => useAlfadocsAuth(), {
      wrapper: wrapper({
        fetch: fetchMock as unknown as typeof fetch,
        navigate,
        basePath: '/auth',
      }),
    });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    act(() => result.current.connect());
    expect(navigate).toHaveBeenCalledWith('/auth/login');
  });

  it('signOut() POSTs /logout then re-reads the session', async () => {
    let authed = true;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/logout')) {
        expect(init?.method).toBe('POST');
        authed = false;
        return jsonResponse({ ok: true });
      }
      return jsonResponse(
        authed
          ? { authenticated: true, user: { email: 'a@b.com' } }
          : { authenticated: false },
      );
    });
    const { result } = renderHook(() => useAlfadocsAuth(), {
      wrapper: wrapper({ fetch: fetchMock as unknown as typeof fetch }),
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('throws when used outside the provider', () => {
    // Suppress React's error-boundary console noise for the expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAlfadocsAuth())).toThrow(
      /must be used within an <AlfadocsAuthProvider>/,
    );
    spy.mockRestore();
  });
});
