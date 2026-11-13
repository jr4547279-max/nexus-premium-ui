import { computeGoldenWindows, type GoldenWindowAvailabilityRow, type GoldenWindowMember } from "../../../nexus-premium-ui/lib/golden-window";

interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  CIRCLE_ROOM: DurableObjectNamespace;
  APP_ORIGIN: string;
  PUBLIC_APP_URL?: string;
  AUTH_MODE?: string;
  ALLOW_DEV_AUTH?: string;
  EMAIL_FROM?: string;
  EMAIL_API_URL?: string;
  EMAIL_API_TOKEN?: string;
}

type User = { id: string; email: string; display_name: string };
type ApiResult = { status?: number; body?: unknown; headers?: HeadersInit };
const SESSION_COOKIE = "nx_session";
const SESSION_DAYS = 30;
const MAX_BODY_BYTES = 128 * 1024;

function respond(body: unknown, status = 200, headers?: HeadersInit): Response {
  const result = new Headers(headers);
  result.set("content-type", "application/json; charset=utf-8");
  result.set("cache-control", "no-store");
  result.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers: result });
}

function fail(status: number, code: string, message: string): ApiResult {
  return { status, body: { error: { code, message } } };
}

function id(): string {
  return crypto.randomUUID();
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return b64url(new Uint8Array(hash));
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function cookie(request: Request, name: string): string | null {
  const value = request.headers.get("cookie") ?? "";
  for (const item of value.split(";")) {
    const split = item.trim().indexOf("=");
    if (split > 0 && item.slice(0, split).trim() === name) return decodeURIComponent(item.slice(split + 1).trim());
  }
  return null;
}

function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await digest(token);
  return env.DB.prepare(`
    SELECT u.id, u.email, COALESCE(p.display_name, '') AS display_name
    FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN profiles p ON p.user_id=u.id
    WHERE s.token_hash=?1 AND s.revoked_at IS NULL AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(tokenHash).first<User>();
}

async function memberOf(env: Env, circleId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS ok FROM circle_members WHERE circle_id=?1 AND user_id=?2")
    .bind(circleId, userId).first<{ ok: number }>();
  return !!row;
}

async function notifyCircleMembers(env: Env, circleId: string, actorId: string, kind: string, payload: Record<string, unknown>, planId?: string): Promise<void> {
  const members = await env.DB.prepare("SELECT user_id FROM circle_members WHERE circle_id=?1 AND user_id<>?2").bind(circleId, actorId).all<{ user_id: string }>();
  if (!members.results.length) return;
  await env.DB.batch(members.results.map((member) => env.DB.prepare("INSERT INTO notifications(id,user_id,circle_id,plan_id,kind,payload_json) VALUES(?1,?2,?3,?4,?5,?6)")
    .bind(id(), member.user_id, circleId, planId ?? null, kind, JSON.stringify(payload))));
}

function sameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  try {
    return new URL(origin).origin === new URL(env.APP_ORIGIN).origin;
  } catch {
    return false;
  }
}

async function rateLimit(env: Env, key: string, maxHits: number, windowSeconds: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const hashed = await digest(key);
  const result = await env.DB.prepare(`
    INSERT INTO rate_limits(bucket_key, window_started_at, hit_count) VALUES (?1, ?2, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      hit_count=CASE WHEN window_started_at <= ?2 - ?3 THEN 1 ELSE hit_count + 1 END,
      window_started_at=CASE WHEN window_started_at <= ?2 - ?3 THEN ?2 ELSE window_started_at END
    RETURNING hit_count
  `).bind(hashed, now, windowSeconds).first<{ hit_count: number }>();
  return (result?.hit_count ?? maxHits + 1) <= maxHits;
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function sendEmail(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.EMAIL_API_URL || !env.EMAIL_API_TOKEN || !env.EMAIL_FROM) return false;
  let endpoint: URL;
  try { endpoint = new URL(env.EMAIL_API_URL); } catch { return false; }
  if (endpoint.protocol !== "https:" && env.AUTH_MODE !== "development") return false;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${env.EMAIL_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });
  return response.ok;
}

function timeIsValid(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

async function handle(request: Request, env: Env): Promise<ApiResult | Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const secure = url.protocol === "https:";
  if (request.method === "OPTIONS") return { status: 204, body: null };
  if (!path.startsWith("/v1/")) return fail(404, "not_found", "Route not found.");

  if (path === "/v1/health" && request.method === "GET") {
    return { body: { ok: true, service: "nexus-api", mode: env.AUTH_MODE === "development" ? "development" : "production" } };
  }

  if (!sameOrigin(request, env)) return fail(403, "origin_rejected", "Request origin is not allowed.");

  if (path === "/v1/auth/request-link" && request.method === "POST") {
    const body = await readJson(request);
    if (!body || !validEmail(body.email)) return fail(400, "invalid_email", "Enter a valid email address.");
    const email = body.email.trim().toLowerCase();
    if (!await rateLimit(env, `${clientIp(request)}:${email}:magic-link`, 5, 900)) {
      return fail(429, "rate_limited", "Too many sign-in requests. Try again later.");
    }
    const token = randomToken();
    const tokenHash = await digest(token);
    const challengeId = id();
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    await env.DB.prepare("INSERT INTO auth_challenges(id,email,token_hash,expires_at) VALUES(?1,?2,?3,?4)")
      .bind(challengeId, email, tokenHash, expires).run();
    const verifyUrl = new URL("/auth/verify", env.PUBLIC_APP_URL ?? env.APP_ORIGIN);
    verifyUrl.searchParams.set("token", token);
    const sent = await sendEmail(env, email, "Your Nexus sign-in link", `Use this one-time link to sign in to Nexus. It expires in 15 minutes.\n\n${verifyUrl}\n\nIf you did not request this, you can ignore this email.`);
    if (!sent && env.AUTH_MODE === "development" && env.ALLOW_DEV_AUTH === "true") {
      return { status: 202, body: { ok: true, delivery: "development", verificationUrl: verifyUrl.toString() } };
    }
    // Do not disclose account existence or expose tokens when email is unavailable.
    if (!sent) return fail(503, "email_unavailable", "Sign-in email is temporarily unavailable. Try again later.");
    return { status: 202, body: { ok: true } };
  }

  if (path === "/v1/auth/verify" && request.method === "POST") {
    const body = await readJson(request);
    if (typeof body?.token !== "string" || body.token.length < 32 || body.token.length > 128) return fail(400, "invalid_link", "This sign-in link is invalid or has expired.");
    if (!await rateLimit(env, `${clientIp(request)}:verify-link`, 12, 900)) return fail(429, "rate_limited", "Too many verification attempts. Try again later.");
    const tokenHash = await digest(body.token);
    const challenge = await env.DB.prepare("SELECT id,email FROM auth_challenges WHERE token_hash=?1 AND consumed_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') AND attempts < 8")
      .bind(tokenHash).first<{ id: string; email: string }>();
    if (!challenge) return fail(400, "invalid_link", "This sign-in link is invalid or has expired.");
    const userId = id();
    const sessionToken = randomToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    const consumed = await env.DB.prepare("UPDATE auth_challenges SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1 AND consumed_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING email")
      .bind(challenge.id).first<{ email: string }>();
    if (!consumed) return fail(400, "invalid_link", "This sign-in link is invalid or has expired.");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users(id,email,email_verified_at) VALUES(?1,?2,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(email) DO UPDATE SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(userId, consumed.email),
    ]);
    const user = await env.DB.prepare("SELECT id,email FROM users WHERE email=?1").bind(consumed.email).first<{ id: string; email: string }>();
    if (!user) return fail(500, "account_create_failed", "Could not complete sign-in.");
    await env.DB.prepare("INSERT OR IGNORE INTO profiles(user_id,display_name) VALUES(?1,?2)").bind(user.id, user.email.split("@")[0] ?? "").run();
    await env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?1,?2,?3,?4)")
      .bind(id(), user.id, await digest(sessionToken), expires).run();
    return { body: { ok: true, user: { id: user.id, email: user.email } }, headers: { "set-cookie": sessionCookie(sessionToken, secure) } };
  }

  if (path === "/v1/auth/logout" && request.method === "POST") {
    const token = cookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("UPDATE sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?1")
      .bind(await digest(token)).run();
    return { body: { ok: true }, headers: { "set-cookie": clearSessionCookie(secure) } };
  }

  if (path === "/v1/invitations/preview" && request.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) return fail(404, "invalid_invitation", "Invitation is invalid or expired.");
    const invite = await env.DB.prepare(`SELECT i.id,c.id AS circle_id,c.name,
      (SELECT COUNT(*) FROM circle_members cm WHERE cm.circle_id=c.id) AS member_count
      FROM invitations i JOIN circles c ON c.id=i.circle_id
      WHERE i.token_hash=?1 AND i.accepted_at IS NULL AND i.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(await digest(token)).first<{ id: string; circle_id: string; name: string; member_count: number }>();
    return invite ? { body: { invitation: { circle_id: invite.circle_id, name: invite.name, member_count: invite.member_count } } } : fail(404, "invalid_invitation", "Invitation is invalid or expired.");
  }

  const user = await currentUser(request, env);
  if (path === "/v1/auth/me" && request.method === "GET") return user ? { body: { user } } : fail(401, "unauthorized", "Sign in to continue.");
  if (!user) return fail(401, "unauthorized", "Sign in to continue.");

  if (path === "/v1/profile" && request.method === "GET") {
    const profile = await env.DB.prepare(`SELECT u.id,u.email,p.display_name,p.username,p.avatar_key,p.timezone,
      p.preferences_json,p.onboarding_completed,p.onboarding_answers_json,p.latitude,p.longitude,
      p.formatted_address,p.place_id,p.location_updated_at,p.bio,p.favourite_activities_json,
      p.created_at,p.updated_at
      FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?1`).bind(user.id).first<Record<string, unknown>>();
    if (!profile) return fail(404, "profile_not_found", "Profile not found.");
    return { body: { profile: {
      id: profile.id, email: profile.email, display_name: profile.display_name, username: profile.username,
      avatar_url: profile.avatar_key, timezone: profile.timezone,
      preferences: JSON.parse(String(profile.preferences_json ?? "{}")),
      onboarding_completed: Boolean(profile.onboarding_completed),
      onboarding_answers: JSON.parse(String(profile.onboarding_answers_json ?? "{}")),
      latitude: profile.latitude, longitude: profile.longitude, formatted_address: profile.formatted_address,
      place_id: profile.place_id, location_updated_at: profile.location_updated_at, bio: profile.bio,
      favourite_activities: JSON.parse(String(profile.favourite_activities_json ?? "[]")),
      created_at: profile.created_at, updated_at: profile.updated_at,
    } } };
  }

  if (path === "/v1/profile" && request.method === "PATCH") {
    const body = await readJson(request);
    if (!body) return fail(400, "invalid_profile", "Profile details are invalid.");
    const changes: Array<[string, unknown]> = [];
    if (body.display_name !== undefined) {
      if (typeof body.display_name !== "string" || body.display_name.trim().length > 80) return fail(400, "invalid_profile", "Display name must be at most 80 characters.");
      changes.push(["display_name", body.display_name.trim()]);
    }
    if (body.username !== undefined) {
      if (typeof body.username !== "string" || !/^[a-zA-Z0-9_]{3,24}$/.test(body.username)) return fail(400, "invalid_profile", "Username must be 3–24 letters, numbers or underscores.");
      changes.push(["username", body.username]);
    }
    if (body.preferences !== undefined && body.preferences && typeof body.preferences === "object" && !Array.isArray(body.preferences)) changes.push(["preferences_json", JSON.stringify(body.preferences)]);
    if (body.onboarding_completed !== undefined && typeof body.onboarding_completed === "boolean") changes.push(["onboarding_completed", body.onboarding_completed ? 1 : 0]);
    if (body.onboarding_answers !== undefined && body.onboarding_answers && typeof body.onboarding_answers === "object" && !Array.isArray(body.onboarding_answers)) changes.push(["onboarding_answers_json", JSON.stringify(body.onboarding_answers)]);
    if (body.favourite_activities !== undefined && Array.isArray(body.favourite_activities) && body.favourite_activities.every((x) => typeof x === "string" && x.length < 60)) changes.push(["favourite_activities_json", JSON.stringify(body.favourite_activities)]);
    if (body.bio !== undefined && (typeof body.bio === "string" || body.bio === null) && (body.bio === null || body.bio.length <= 240)) changes.push(["bio", body.bio]);
    if (body.location !== undefined && body.location && typeof body.location === "object") {
      const location = body.location as Record<string, unknown>;
      if (typeof location.latitude !== "number" || location.latitude < -90 || location.latitude > 90 || typeof location.longitude !== "number" || location.longitude < -180 || location.longitude > 180 || typeof location.formatted_address !== "string" || location.formatted_address.length > 300) return fail(400, "invalid_profile", "Location details are invalid.");
      changes.push(["latitude", location.latitude], ["longitude", location.longitude], ["formatted_address", location.formatted_address], ["place_id", typeof location.place_id === "string" ? location.place_id.slice(0, 200) : null], ["location_updated_at", new Date().toISOString()]);
    }
    const allowedColumns = new Set(["display_name","username","preferences_json","onboarding_completed","onboarding_answers_json","favourite_activities_json","bio","latitude","longitude","formatted_address","place_id","location_updated_at"]);
    if (changes.some(([column]) => !allowedColumns.has(column))) return fail(400, "invalid_profile", "Profile details are invalid.");
    if (changes.length) {
      const assignments = changes.map(([column]) => `${column}=?`).join(",");
      await env.DB.prepare(`UPDATE profiles SET ${assignments},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?`)
        .bind(...changes.map(([, value]) => value), user.id).run();
    }
    return { body: { ok: true } };
  }

  if (path === "/v1/circles" && request.method === "GET") {
    const result = await env.DB.prepare(`SELECT c.id,c.name,c.emoji,c.activity_id,c.created_by,c.created_at,cm.role,
      (SELECT COUNT(*) FROM circle_members m WHERE m.circle_id=c.id) AS member_count
      FROM circles c JOIN circle_members cm ON cm.circle_id=c.id WHERE cm.user_id=?1 ORDER BY c.updated_at DESC`)
      .bind(user.id).all();
    return { body: { circles: result.results } };
  }

  if (path === "/v1/circles" && request.method === "POST") {
    const body = await readJson(request);
    if (typeof body?.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 80) return fail(400, "invalid_circle", "Circle name must be 1 to 80 characters.");
    const circleId = id();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO circles(id,name,emoji,activity_id,created_by) VALUES(?1,?2,?3,?4,?5)").bind(circleId, body.name.trim(), typeof body.emoji === "string" ? body.emoji.slice(0, 8) : "👥", typeof body.activityId === "string" ? body.activityId.slice(0, 80) : null, user.id),
      env.DB.prepare("INSERT INTO circle_members(circle_id,user_id,role) VALUES(?1,?2,'owner')").bind(circleId, user.id),
    ]);
    return { status: 201, body: { circle: { id: circleId, name: body.name.trim(), emoji: typeof body.emoji === "string" ? body.emoji.slice(0, 8) : "👥", activity_id: typeof body.activityId === "string" ? body.activityId : null, created_by: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), role: "owner", member_count: 1 } } };
  }

  const inviteMatch = path.match(/^\/v1\/circles\/([^/]+)\/invitations$/);
  if (inviteMatch && request.method === "POST") {
    const circleId = inviteMatch[1]!;
    if (!await memberOf(env, circleId, user.id)) return fail(404, "circle_not_found", "Circle not found.");
    const body = await readJson(request);
    if (!validEmail(body?.email)) return fail(400, "invalid_email", "Enter a valid invitation email address.");
    const email = body.email.trim().toLowerCase();
    const token = randomToken();
    const link = new URL(`/invite/${encodeURIComponent(token)}`, env.PUBLIC_APP_URL ?? env.APP_ORIGIN);
    if (!await sendEmail(env, email, "You are invited to a Nexus Circle", `Join ${user.display_name || "your friend"} on Nexus. This invitation expires in 7 days.\n\n${link}`)) {
      return fail(503, "email_unavailable", "Invitations are not available until email delivery is configured.");
    }
    const invitationId = id();
    await env.DB.prepare("INSERT INTO invitations(id,circle_id,invited_by,email,token_hash,expires_at) VALUES(?1,?2,?3,?4,?5,?6)")
      .bind(invitationId, circleId, user.id, email, await digest(token), new Date(Date.now() + 7 * 86400_000).toISOString()).run();
    return { status: 201, body: { invitation: { id: invitationId, email, expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() } } };
  }

  if (path === "/v1/invitations/accept" && request.method === "POST") {
    const body = await readJson(request);
    if (typeof body?.token !== "string") return fail(400, "invalid_invitation", "Invitation is invalid or expired.");
    const inv = await env.DB.prepare("SELECT id,circle_id,email FROM invitations WHERE token_hash=?1 AND accepted_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')")
      .bind(await digest(body.token)).first<{ id: string; circle_id: string; email: string }>();
    if (!inv || inv.email.toLowerCase() !== user.email.toLowerCase()) return fail(404, "invalid_invitation", "Invitation is invalid or expired.");
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO circle_members(circle_id,user_id) VALUES(?1,?2)").bind(inv.circle_id, user.id),
      env.DB.prepare("UPDATE invitations SET accepted_by=?1,accepted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND accepted_at IS NULL").bind(user.id, inv.id),
    ]);
    return { body: { ok: true, circle_id: inv.circle_id } };
  }

  const circleMatch = path.match(/^\/v1\/circles\/([^/]+)(?:\/(availability|golden-window|plans|messages|venues|live|members))?$/);
  if (circleMatch) {
    const circleId = circleMatch[1]!;
    const sub = circleMatch[2] ?? "";
    if (!await memberOf(env, circleId, user.id)) return fail(404, "circle_not_found", "Circle not found.");

    if (!sub && request.method === "GET") {
      const circle = await env.DB.prepare(`SELECT id,name,emoji,activity_id,created_by,planning_location_json,created_at,updated_at,
        (SELECT role FROM circle_members WHERE circle_id=?1 AND user_id=?2) AS role
        FROM circles WHERE id=?1`).bind(circleId, user.id).first<Record<string, unknown>>();
      if (!circle) return fail(404, "circle_not_found", "Circle not found.");
      return { body: { circle: { ...circle, planning_location: circle.planning_location_json ? JSON.parse(String(circle.planning_location_json)) : null } } };
    }

    if (sub === "members" && request.method === "GET") {
      const result = await env.DB.prepare(`SELECT cm.user_id,cm.role,cm.joined_at,p.display_name,NULL AS email
        FROM circle_members cm JOIN users u ON u.id=cm.user_id LEFT JOIN profiles p ON p.user_id=u.id
        WHERE cm.circle_id=?1 ORDER BY cm.joined_at`).bind(circleId).all();
      return { body: { members: result.results } };
    }

    if (sub === "availability" && request.method === "GET") {
      const result = await env.DB.prepare(`SELECT a.user_id,a.day_of_week,a.start_time,a.end_time,p.display_name,NULL AS email
        FROM availability a JOIN profiles p ON p.user_id=a.user_id JOIN users u ON u.id=a.user_id
        WHERE a.circle_id=?1 ORDER BY a.day_of_week,a.start_time`).bind(circleId).all();
      return { body: { slots: result.results } };
    }

    if (sub === "availability" && request.method === "PUT") {
      const body = await readJson(request);
      const slots = body?.slots;
      if (!Array.isArray(slots) || slots.length > 84 || !slots.every((s) => s && typeof s === "object" && Number.isInteger((s as any).dayOfWeek) && (s as any).dayOfWeek >= 0 && (s as any).dayOfWeek <= 6 && timeIsValid((s as any).startTime) && timeIsValid((s as any).endTime) && (s as any).startTime < (s as any).endTime)) {
        return fail(400, "invalid_availability", "Availability must contain valid weekday time ranges.");
      }
      const statements = [env.DB.prepare("DELETE FROM availability WHERE circle_id=?1 AND user_id=?2").bind(circleId, user.id),
        ...slots.map((s: any) => env.DB.prepare("INSERT INTO availability(id,circle_id,user_id,day_of_week,start_time,end_time) VALUES(?1,?2,?3,?4,?5,?6)").bind(id(), circleId, user.id, s.dayOfWeek, s.startTime, s.endTime))];
      await env.DB.batch(statements);
      return { body: { ok: true, count: slots.length } };
    }

    if (sub === "golden-window" && request.method === "GET") {
      const membersResult = await env.DB.prepare("SELECT u.id,p.display_name AS name FROM circle_members cm JOIN users u ON u.id=cm.user_id LEFT JOIN profiles p ON p.user_id=u.id WHERE cm.circle_id=?1").bind(circleId).all<GoldenWindowMember>();
      const slotsResult = await env.DB.prepare("SELECT user_id,day_of_week,start_time,end_time FROM availability WHERE circle_id=?1").bind(circleId).all<GoldenWindowAvailabilityRow>();
      const windows = computeGoldenWindows(membersResult.results, slotsResult.results);
      const best = windows[0];
      if (best) await env.DB.prepare("INSERT INTO golden_windows(id,circle_id,result_json) VALUES(?1,?2,?3)").bind(id(), circleId, JSON.stringify(best)).run();
      return { body: { windows, computed_at: new Date().toISOString(), source: "member-submitted availability" } };
    }

    if (!sub && request.method === "PATCH") {
      const body = await readJson(request);
      if (!body) return fail(400, "invalid_circle", "Circle details are invalid.");
      if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 80)) return fail(400, "invalid_circle", "Circle name must be 1 to 80 characters.");
      let planningLocation: string | null | undefined;
      if (body.planningLocation !== undefined) {
        if (body.planningLocation === null) planningLocation = null;
        else if (body.planningLocation && typeof body.planningLocation === "object") {
          const location = body.planningLocation as Record<string, unknown>;
          if (typeof location.lat !== "number" || location.lat < -90 || location.lat > 90 || typeof location.lng !== "number" || location.lng < -180 || location.lng > 180) return fail(400, "invalid_location", "Planning location is invalid.");
          planningLocation = JSON.stringify(location);
        } else return fail(400, "invalid_location", "Planning location is invalid.");
      }
      if (body.name !== undefined) await env.DB.prepare("UPDATE circles SET name=?1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2").bind((body.name as string).trim(), circleId).run();
      if (planningLocation !== undefined) await env.DB.prepare("UPDATE circles SET planning_location_json=?1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2").bind(planningLocation, circleId).run();
      return { body: { ok: true } };
    }

    if (!sub && request.method === "DELETE") {
      const role = await env.DB.prepare("SELECT role FROM circle_members WHERE circle_id=?1 AND user_id=?2").bind(circleId, user.id).first<{ role: string }>();
      if (role?.role !== "owner") return fail(403, "owner_required", "Only a Circle owner can delete it.");
      await env.DB.prepare("DELETE FROM circles WHERE id=?1").bind(circleId).run();
      return { body: { ok: true } };
    }

    if (sub === "members" && request.method === "DELETE") {
      const role = await env.DB.prepare("SELECT role FROM circle_members WHERE circle_id=?1 AND user_id=?2").bind(circleId, user.id).first<{ role: string }>();
      if (role?.role === "owner") return fail(409, "owner_cannot_leave", "Transfer Circle ownership before leaving.");
      await env.DB.prepare("DELETE FROM circle_members WHERE circle_id=?1 AND user_id=?2").bind(circleId, user.id).run();
      return { body: { ok: true } };
    }

    if (sub === "plans" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM plans WHERE circle_id=?1 ORDER BY starts_at").bind(circleId).all();
      return { body: { plans: rows.results } };
    }

    if (sub === "plans" && request.method === "POST") {
      const body = await readJson(request);
      if (typeof body?.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 120 || typeof body.startsAt !== "string" || !Number.isFinite(Date.parse(body.startsAt))) return fail(400, "invalid_plan", "Provide a title and valid start time.");
      const planId = id();
      await env.DB.prepare("INSERT INTO plans(id,circle_id,created_by,title,starts_at,ends_at,venue_snapshot_json,status) VALUES(?1,?2,?3,?4,?5,?6,?7,'proposed')")
        .bind(planId, circleId, user.id, body.title.trim(), new Date(body.startsAt).toISOString(), typeof body.endsAt === "string" ? new Date(body.endsAt).toISOString() : null, body.venue && typeof body.venue === "object" ? JSON.stringify(body.venue) : null).run();
      await notifyCircleMembers(env, circleId, user.id, "plan_proposed", { title: body.title.trim(), starts_at: new Date(body.startsAt).toISOString() }, planId);
      return { status: 201, body: { plan: { id: planId, circle_id: circleId, title: body.title.trim(), starts_at: new Date(body.startsAt).toISOString(), status: "proposed" } } };
    }

    if (sub === "messages" && request.method === "GET") {
      const before = url.searchParams.get("before");
      const rows = await env.DB.prepare(`SELECT m.id,m.circle_id,m.sender_id,m.body,m.message_type,m.metadata_json,m.attachment_key,m.created_at,p.display_name
        FROM chat_messages m JOIN profiles p ON p.user_id=m.sender_id WHERE m.circle_id=?1 AND (?2 IS NULL OR m.created_at < ?2)
        ORDER BY m.created_at DESC LIMIT 50`).bind(circleId, before).all();
      return { body: { messages: rows.results.reverse().map((row: any) => ({ ...row, group_id: row.circle_id, user_id: row.sender_id, message: row.body, metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : null, sender_name: row.display_name, sender_username: null, sender_avatar_url: null })) } };
    }

    if (sub === "messages" && request.method === "POST") {
      const body = await readJson(request);
      const validTypes = ["text","system","route","location","poll","image"];
      const messageType = typeof body?.messageType === "string" && validTypes.includes(body.messageType) ? body.messageType : "text";
      if (typeof body?.body !== "string" || body.body.trim().length < 1 || body.body.length > 4000 || (messageType !== "text" && messageType !== "system" && !body.metadata)) return fail(400, "invalid_message", "Message content is invalid.");
      const message = { id: id(), circle_id: circleId, group_id: circleId, sender_id: user.id, user_id: user.id, body: body.body.trim(), message: body.body.trim(), message_type: messageType, metadata: body.metadata ?? null, created_at: new Date().toISOString(), display_name: user.display_name, sender_name: user.display_name, sender_username: null, sender_avatar_url: null };
      await env.DB.prepare("INSERT INTO chat_messages(id,circle_id,sender_id,body,message_type,metadata_json) VALUES(?1,?2,?3,?4,?5,?6)").bind(message.id, circleId, user.id, message.body, messageType, body.metadata ? JSON.stringify(body.metadata) : null).run();
      await notifyCircleMembers(env, circleId, user.id, "new_message", { message_id: message.id, sender_name: user.display_name });
      const room = env.CIRCLE_ROOM.get(env.CIRCLE_ROOM.idFromName(circleId));
      await room.fetch("https://circle-room.internal/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "message", message }) });
      return { status: 201, body: { message } };
    }

    if (sub === "live" && request.method === "GET") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return fail(426, "websocket_required", "This route requires a WebSocket connection.");
      const room = env.CIRCLE_ROOM.get(env.CIRCLE_ROOM.idFromName(circleId));
      return room.fetch(new Request("https://circle-room.internal/connect", request));
    }

    if (sub === "venues" && request.method === "GET") {
      const planId = url.searchParams.get("planId");
      if (!planId) return fail(400, "plan_required", "Choose a plan before reading venue votes.");
      const hasPlan = await env.DB.prepare("SELECT 1 FROM plans WHERE id=?1 AND circle_id=?2").bind(planId, circleId).first();
      if (!hasPlan) return fail(404, "plan_not_found", "Plan not found.");
      const rows = await env.DB.prepare(`SELECT v.id,v.name,v.venue_type,v.location_json,v.price_level,COUNT(CASE WHEN vv.vote=1 THEN 1 END) AS likes
        FROM venues v LEFT JOIN venue_votes vv ON vv.venue_id=v.id AND vv.plan_id=?1
        WHERE v.id IN (SELECT venue_id FROM venue_votes WHERE plan_id=?1) GROUP BY v.id ORDER BY likes DESC`).bind(planId).all();
      return { body: { venues: rows.results } };
    }
  }

  const pollVoteMatch = path.match(/^\/v1\/messages\/([^/]+)\/vote$/);
  if (pollVoteMatch && request.method === "POST") {
    const messageId = pollVoteMatch[1]!;
    const row = await env.DB.prepare("SELECT id,circle_id,message_type,metadata_json FROM chat_messages WHERE id=?1").bind(messageId).first<{ id: string; circle_id: string; message_type: string; metadata_json: string | null }>();
    if (!row || !await memberOf(env, row.circle_id, user.id)) return fail(404, "message_not_found", "Message not found.");
    if (row.message_type !== "poll" || !row.metadata_json) return fail(400, "not_a_poll", "This message is not a poll.");
    const body = await readJson(request);
    const metadata = JSON.parse(row.metadata_json) as { event?: string; options?: Array<{ id: string; text: string; votes: string[] }> };
    if (metadata.event !== "poll" || typeof body?.optionId !== "string" || !metadata.options?.some((option) => option.id === body.optionId)) return fail(400, "invalid_poll_option", "Choose an option from this poll.");
    metadata.options = metadata.options.map((option) => ({ ...option, votes: option.id === body.optionId ? [...new Set([...option.votes.filter((vote) => vote !== user.id), user.id])] : option.votes.filter((vote) => vote !== user.id) }));
    await env.DB.prepare("UPDATE chat_messages SET metadata_json=?1 WHERE id=?2").bind(JSON.stringify(metadata), messageId).run();
    return { body: { ok: true } };
  }

  const planMatch = path.match(/^\/v1\/plans\/([^/]+)\/(rsvps|votes|confirm)$/);
  if (planMatch) {
    const planId = planMatch[1]!;
    const action = planMatch[2]!;
    const plan = await env.DB.prepare("SELECT id,circle_id,status FROM plans WHERE id=?1").bind(planId).first<{ id: string; circle_id: string; status: string }>();
    if (!plan || !await memberOf(env, plan.circle_id, user.id)) return fail(404, "plan_not_found", "Plan not found.");
    if (action === "rsvps" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT r.user_id,r.response,r.updated_at,p.display_name FROM rsvps r JOIN profiles p ON p.user_id=r.user_id WHERE r.plan_id=?1").bind(planId).all();
      return { body: { rsvps: result.results } };
    }
    if (action === "rsvps" && request.method === "PUT") {
      const body = await readJson(request);
      if (!body || !(["yes","no","maybe"] as unknown[]).includes(body.response)) return fail(400, "invalid_rsvp", "Response must be yes, no or maybe.");
      await env.DB.prepare("INSERT INTO rsvps(plan_id,user_id,response) VALUES(?1,?2,?3) ON CONFLICT(plan_id,user_id) DO UPDATE SET response=excluded.response,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(planId, user.id, body.response).run();
      const owner = await env.DB.prepare("SELECT created_by FROM plans WHERE id=?1").bind(planId).first<{ created_by: string }>();
      if (owner && owner.created_by !== user.id) await env.DB.prepare("INSERT INTO notifications(id,user_id,circle_id,plan_id,kind,payload_json) VALUES(?1,?2,?3,?4,'rsvp_updated',?5)").bind(id(), owner.created_by, plan.circle_id, planId, JSON.stringify({ response: body.response })).run();
      return { body: { ok: true } };
    }
    if (action === "votes" && request.method === "POST") {
      const body = await readJson(request);
      if (typeof body?.venueName !== "string" || body.venueName.length > 120 || !([1,-1] as unknown[]).includes(body?.vote)) return fail(400, "invalid_vote", "Choose a venue and vote.");
      const venueId = typeof body.venueId === "string" ? body.venueId : id();
      if (!body.venueId) await env.DB.prepare("INSERT OR IGNORE INTO venues(id,provider,provider_venue_id,name,venue_type,location_json,price_level,details_json) VALUES(?1,'nexus-suggestion',?2,?3,?4,?5,?6,'{}')").bind(venueId, `${planId}:${body.venueName}`, body.venueName, body.venueType ?? null, body.location ? JSON.stringify(body.location) : null, Number.isInteger(body.priceLevel) ? body.priceLevel : null).run();
      await env.DB.prepare("INSERT INTO venue_votes(plan_id,venue_id,user_id,vote) VALUES(?1,?2,?3,?4) ON CONFLICT(plan_id,venue_id,user_id) DO UPDATE SET vote=excluded.vote,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(planId, venueId, user.id, body.vote).run();
      return { body: { ok: true, venue_id: venueId } };
    }
    if (action === "confirm" && request.method === "POST") {
      const body = await readJson(request);
      if (plan.status === "cancelled") return fail(409, "plan_cancelled", "Cancelled plans cannot be confirmed.");
      const venueId = typeof body?.venueId === "string" ? body.venueId : null;
      if (venueId && !await env.DB.prepare("SELECT 1 FROM venue_votes WHERE venue_id=?1 AND plan_id=?2").bind(venueId, planId).first()) return fail(400, "venue_not_proposed", "Vote for a proposed venue before confirming it.");
      await env.DB.prepare("UPDATE plans SET status='confirmed',venue_id=COALESCE(?1,venue_id),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2").bind(venueId, planId).run();
      return { body: { ok: true, status: "confirmed" } };
    }
  }

  if (path === "/v1/notifications" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT id,circle_id,plan_id,kind,payload_json,read_at,created_at FROM notifications WHERE user_id=?1 ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
    return { body: { notifications: result.results } };
  }
  const notificationMatch = path.match(/^\/v1\/notifications\/([^/]+)\/read$/);
  if (notificationMatch && request.method === "POST") {
    const result = await env.DB.prepare("UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1 AND user_id=?2")
      .bind(notificationMatch[1]!, user.id).run();
    if (!result.meta.changes) return fail(404, "notification_not_found", "Notification not found.");
    return { body: { ok: true } };
  }

  if (path === "/v1/uploads" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 10 * 1024 * 1024 || !["image/jpeg","image/png","image/webp"].includes(file.type)) return fail(400, "invalid_upload", "Upload a JPG, PNG or WebP image up to 10 MB.");
    const circleId = form.get("circleId");
    if (typeof circleId !== "string" || !await memberOf(env, circleId, user.id)) return fail(403, "circle_membership_required", "Join the Circle before uploading a chat image.");
    const key = `${circleId}/${user.id}/${id()}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`;
    await env.UPLOADS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await env.DB.prepare("INSERT INTO upload_metadata(object_key,owner_id,circle_id,content_type,size_bytes) VALUES(?1,?2,?3,?4,?5)").bind(key, user.id, circleId, file.type, file.size).run();
    return { status: 201, body: { key, source: "private R2 object" } };
  }

  const uploadMatch = path.match(/^\/v1\/uploads\/(.+)$/);
  if (uploadMatch && request.method === "GET") {
    const key = decodeURIComponent(uploadMatch[1]!);
    const metadata = await env.DB.prepare("SELECT circle_id,content_type FROM upload_metadata WHERE object_key=?1").bind(key).first<{ circle_id: string | null; content_type: string }>();
    if (!metadata?.circle_id || !await memberOf(env, metadata.circle_id, user.id)) return fail(404, "upload_not_found", "Image not found.");
    const object = await env.UPLOADS.get(key);
    if (!object) return fail(404, "upload_not_found", "Image not found.");
    return new Response(object.body, { headers: { "content-type": metadata.content_type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
  }

  return fail(404, "not_found", "Route not found.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = new Headers();
    if (origin && sameOrigin(request, env)) {
      cors.set("access-control-allow-origin", origin);
      cors.set("access-control-allow-credentials", "true");
      cors.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      cors.set("access-control-allow-headers", "content-type");
      cors.set("vary", "Origin");
    }
    try {
      const result = await handle(request, env);
      if (result instanceof Response) return result;
      const headers = new Headers(result.headers);
      cors.forEach((value, key) => headers.set(key, value));
      return result.status === 204 ? new Response(null, { status: 204, headers }) : respond(result.body ?? {}, result.status ?? 200, headers);
    } catch (error) {
      console.error("[nexus-api] request failed", error instanceof Error ? error.message : "unknown error");
      return respond({ error: { code: "internal_error", message: "The request could not be completed." } }, 500, cors);
    }
  },
};

export class CircleRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/connect" && request.method === "GET") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === "/publish" && request.method === "POST") {
      const message = await request.text();
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(message); } catch { socket.close(1011, "broadcast failed"); }
      }
      return new Response(null, { status: 204 });
    }
    return new Response("Not found", { status: 404 });
  }

}
