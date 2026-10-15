import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Whether a 401 from this URL must NOT trigger the "session expired" flow.
 *
 * - /api/auth/*   : a failed login/register is handled by the login page itself.
 * - /api/public/* : the consumer portal is anonymous by design.
 * - /api/v1/*     : authenticated by API key, not by session.
 */
function isAnonymousByDesign(url: string): boolean {
  return (
    url.startsWith("/api/auth/") ||
    url.startsWith("/api/public/") ||
    url.startsWith("/api/v1/")
  );
}

let sessionExpiryHandled = false;

/**
 * A 401 on a private endpoint means the session is gone (expired, revoked,
 * cleared cookies, or the app restarted with a new session cookie name).
 *
 * Without this the user keeps staring at a page full of "Error al cargar…"
 * panels while the header shows a half-empty profile. Instead: drop the cached
 * user and send them to the login page once, with a short explanation.
 */
export function handleSessionExpired(): void {
  if (typeof window === "undefined" || sessionExpiryHandled) return;
  if (window.location.pathname.startsWith("/auth")) return;

  sessionExpiryHandled = true;
  queryClient.setQueryData(["/api/auth/user"], null);
  window.location.assign("/auth?expired=1");
}

async function throwIfResNotOk(res: Response, url: string) {
  if (!res.ok) {
    if (res.status === 401 && !isAnonymousByDesign(url)) {
      handleSessionExpired();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Human-readable text for a failed request, for use in a toast or an inline
 * notice.
 *
 * `apiRequest` rejects with `${status}: ${body}` because that is what makes a
 * failed call identifiable in a log. Shown verbatim in the UI it produced
 * messages like `400: {"message":"El email ya está registrado"}`, so this
 * unwraps the server's `message` field and falls back to the raw text when the
 * body is not our JSON envelope (a proxy error page, for instance).
 */
export function apiErrorMessage(error: unknown): string {
  const fallback = "No se pudo completar la operación. Intenta nuevamente.";
  if (!(error instanceof Error)) return fallback;

  const raw = error.message.replace(/^\d{3}:\s*/, "").trim();
  if (!raw) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON (a proxy error page, for instance): the body text is the best
    // description available.
    return raw;
  }

  // Our API's envelope: show the human message, and never the raw blob.
  if (parsed && typeof parsed === "object" && "message" in parsed) {
    const message = (parsed as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res, url);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      // The identity query itself: report "anonymous". Private pages always
      // hit at least one other endpoint, which is what triggers the redirect.
      return null;
    }

    await throwIfResNotOk(res, url);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
