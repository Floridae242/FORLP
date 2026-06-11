// Server-side Lampang IOC client. Credentials come from env vars and the
// session cookie is cached in module scope — this file must never be imported
// by client components (only by the /api/cctv route handler).

const BASE = process.env.IOC_BASE_URL ?? "https://iocpiramid.com";
const USERNAME = process.env.IOC_USERNAME;
const PASSWORD = process.env.IOC_PASSWORD;

const SESSION_TTL_MS = 30 * 60_000; // re-login every 30 min

let session: { cookie: string; expires: number } | null = null;

async function login(): Promise<string> {
  if (!USERNAME || !PASSWORD) {
    throw new Error("IOC credentials not configured (set IOC_USERNAME / IOC_PASSWORD)");
  }
  const res = await fetch(`${BASE}/api/v1/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`IOC login failed: ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/sessionId=[^;]+/);
  if (!match) throw new Error("IOC login: session cookie missing");
  session = { cookie: match[0], expires: Date.now() + SESSION_TTL_MS };
  return session.cookie;
}

async function authedGet(path: string): Promise<unknown> {
  let cookie =
    session && session.expires > Date.now() ? session.cookie : await login();

  let res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });

  // session likely expired — re-login once
  if (res.status === 401) {
    cookie = await login();
    res = await fetch(`${BASE}${path}`, {
      headers: { Cookie: cookie },
      cache: "no-store",
    });
  }

  if (!res.ok) throw new Error(`IOC ${path} → ${res.status}`);
  return res.json();
}

export function fetchDevices(): Promise<unknown> {
  return authedGet("/api/v1/device");
}

export function fetchCctvUptime(): Promise<unknown> {
  return authedGet("/api/v1/report/uptimekuma/cctv");
}
