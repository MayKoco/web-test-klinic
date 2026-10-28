export const OWNER_SESSION_KEY = "klinic-owner-session";

export type OwnerSession = {
  accessToken: string;
  refreshToken: string;
  owner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: string;
  };
};

export function readOwnerSession(): OwnerSession | null {
  const value = window.localStorage.getItem(OWNER_SESSION_KEY);
  if (!value) return null;

  try {
    const session = JSON.parse(value) as OwnerSession;
    return session.accessToken && session.refreshToken && session.owner
      ? session
      : null;
  } catch {
    return null;
  }
}

export function storeOwnerSession(session: OwnerSession) {
  window.localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(session));
}

export function clearOwnerSession() {
  window.localStorage.removeItem(OWNER_SESSION_KEY);
}
