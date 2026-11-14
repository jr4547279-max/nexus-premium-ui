import { computeGoldenWindows, type GoldenWindowAvailabilityRow, type GoldenWindowMember } from "../../../nexus-premium-ui/lib/golden-window.ts";

interface Env {
  DB: D1Database;
  UPLOADS?: R2Bucket;
  CIRCLE_ROOM: DurableObjectNamespace;
  LIVE_EVENT_ROOM: DurableObjectNamespace;
  APP_ORIGIN: string;
  PUBLIC_APP_URL?: string;
  AUTH_MODE?: string;
  ALLOW_DEV_AUTH?: string;
  ALLOW_UPLOADS?: string;
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

function parseLiveEvent(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    golden_window_data: JSON.parse(String(row.golden_window_data_json ?? "{}")),
    stops: JSON.parse(String(row.stops_json ?? "[]")),
    sharing_enabled: Boolean(row.sharing_enabled),
    invited_member_ids: JSON.parse(String(row.invited_member_ids_json ?? "[]")),
  };
}

async function eventMember(env: Env, eventId: string, userId: string): Promise<boolean> {
  return !!await env.DB.prepare("SELECT 1 FROM live_event_members WHERE event_id=?1 AND user_id=?2")
    .bind(eventId, userId).first();
}

async function eventNotification(env: Env, eventId: string, actorId: string | null, type: string, payload: Record<string, unknown>, targetId?: string | null): Promise<Record<string, unknown>> {
  const event = await env.DB.prepare("SELECT circle_id FROM live_events WHERE id=?1").bind(eventId).first<{ circle_id: string }>();
  const recipients = targetId
    ? [{ user_id: targetId }]
    : (await env.DB.prepare("SELECT user_id FROM live_event_members WHERE event_id=?1 AND user_id<>?2").bind(eventId, actorId ?? "").all<{ user_id: string }>()).results;
  const notification = { id: id(), event_id: eventId, type, actor_user_id: actorId, target_user_id: targetId ?? null, payload, created_at: new Date().toISOString() };
  const writes = recipients.map((recipient) => env.DB.prepare("INSERT INTO event_notifications(id,event_id,type,actor_user_id,target_user_id,payload_json) VALUES(?1,?2,?3,?4,?5,?6)")
    .bind(id(), eventId, type, actorId, recipient.user_id, JSON.stringify(payload)));
  if (writes.length) await env.DB.batch(writes);
  if (event) {
    const room = env.LIVE_EVENT_ROOM.get(env.LIVE_EVENT_ROOM.idFromName(eventId));
    await room.fetch("https://live-event.internal/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "notification", notification }) });
  }
  return notification;
}

async function publishLiveEvent(env: Env, eventId: string, type: string, payload: unknown): Promise<void> {
  const room = env.LIVE_EVENT_ROOM.get(env.LIVE_EVENT_ROOM.idFromName(eventId));
  await room.fetch("https://live-event.internal/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, payload }) });
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
      avatar_url: profile.avatar_key ? `/v1/avatars/${user.id}` : null, timezone: profile.timezone,
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
    if (body.avatarKey !== undefined) {
      if (body.avatarKey !== null && (typeof body.avatarKey !== "string" || !body.avatarKey.startsWith(`avatars/${user.id}/`))) return fail(400, "invalid_profile", "Avatar reference is invalid.");
      if (typeof body.avatarKey === "string" && !await env.DB.prepare("SELECT 1 FROM upload_metadata WHERE object_key=?1 AND owner_id=?2 AND circle_id IS NULL").bind(body.avatarKey,user.id).first()) return fail(400, "invalid_profile", "Avatar upload was not found.");
      changes.push(["avatar_key", body.avatarKey]);
    }
    if (body.location !== undefined && body.location && typeof body.location === "object") {
      const location = body.location as Record<string, unknown>;
      if (typeof location.latitude !== "number" || location.latitude < -90 || location.latitude > 90 || typeof location.longitude !== "number" || location.longitude < -180 || location.longitude > 180 || typeof location.formatted_address !== "string" || location.formatted_address.length > 300) return fail(400, "invalid_profile", "Location details are invalid.");
      changes.push(["latitude", location.latitude], ["longitude", location.longitude], ["formatted_address", location.formatted_address], ["place_id", typeof location.place_id === "string" ? location.place_id.slice(0, 200) : null], ["location_updated_at", new Date().toISOString()]);
    }
    const allowedColumns = new Set(["display_name","username","avatar_key","preferences_json","onboarding_completed","onboarding_answers_json","favourite_activities_json","bio","latitude","longitude","formatted_address","place_id","location_updated_at"]);
    if (changes.some(([column]) => !allowedColumns.has(column))) return fail(400, "invalid_profile", "Profile details are invalid.");
    if (changes.length) {
      const assignments = changes.map(([column]) => `${column}=?`).join(",");
      await env.DB.prepare(`UPDATE profiles SET ${assignments},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?`)
        .bind(...changes.map(([, value]) => value), user.id).run();
    }
    return { body: { ok: true } };
  }

  if (path === "/v1/friends" && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT p.user_id AS id,p.display_name,p.username,p.avatar_key AS avatar_url,p.bio,p.formatted_address AS location,p.favourite_activities_json AS favourite_activities_json,p.created_at
      FROM friend_requests f JOIN profiles p ON p.user_id=CASE WHEN f.requester_id=?1 THEN f.recipient_id ELSE f.requester_id END
      WHERE f.status='accepted' AND (f.requester_id=?1 OR f.recipient_id=?1) ORDER BY p.display_name`).bind(user.id).all();
    return { body: { friends: rows.results.map((row: any) => ({ ...row, favourite_activities: JSON.parse(String(row.favourite_activities_json ?? "[]")) })) } };
  }
  if (path === "/v1/friends/requests" && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT p.user_id AS id,p.display_name,p.username,p.avatar_key AS avatar_url,p.bio,p.formatted_address AS location,p.favourite_activities_json AS favourite_activities_json,p.created_at
      FROM friend_requests f JOIN profiles p ON p.user_id=f.requester_id WHERE f.recipient_id=?1 AND f.status='pending' ORDER BY f.created_at DESC`).bind(user.id).all();
    return { body: { requests: rows.results.map((row: any) => ({ ...row, favourite_activities: JSON.parse(String(row.favourite_activities_json ?? "[]")) })) } };
  }
  const friendStatusMatch = path.match(/^\/v1\/friends\/([^/]+)\/status$/);
  if (friendStatusMatch && request.method === "GET") {
    const otherId = friendStatusMatch[1]!;
    const state = otherId === user.id ? "self" : await env.DB.prepare(`SELECT requester_id,recipient_id,status FROM friend_requests WHERE (requester_id=?1 AND recipient_id=?2) OR (requester_id=?2 AND recipient_id=?1) ORDER BY CASE status WHEN 'accepted' THEN 0 ELSE 1 END LIMIT 1`).bind(user.id,otherId).first<{ requester_id: string; recipient_id: string; status: string }>();
    const status = state === "self" ? "self" : !state ? "none" : state.status === "accepted" ? "friends" : state.requester_id === user.id ? "request_sent" : "request_received";
    return { body: { status } };
  }
  if (path === "/v1/friends/requests" && request.method === "POST") {
    if (!await rateLimit(env, `${user.id}:friend-request`, 30, 3600)) return fail(429,"rate_limited","Too many friend requests. Try again later.");
    const body = await readJson(request);
    if (typeof body?.userId !== "string" || body.userId === user.id) return fail(400,"invalid_friend","Choose another Nexus member.");
    const target = await env.DB.prepare("SELECT id FROM users WHERE id=?1").bind(body.userId).first();
    if (!target) return fail(404,"user_not_found","Nexus member not found.");
    const reverse = await env.DB.prepare("SELECT status FROM friend_requests WHERE requester_id=?1 AND recipient_id=?2").bind(body.userId,user.id).first<{status:string}>();
    if (reverse?.status === "accepted") return fail(409,"already_friends","You are already connected.");
    if (reverse?.status === "pending") return fail(409,"request_received","This member has already sent you a request.");
    await env.DB.prepare("INSERT INTO friend_requests(requester_id,recipient_id,status) VALUES(?1,?2,'pending') ON CONFLICT(requester_id,recipient_id) DO UPDATE SET status='pending',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(user.id,body.userId).run();
    await env.DB.prepare("INSERT INTO notifications(id,user_id,kind,payload_json) VALUES(?1,?2,'friend_request',?3)").bind(id(),body.userId,JSON.stringify({ user_id:user.id,display_name:user.display_name })).run();
    return { status: 201, body: { status: "request_sent" } };
  }
  const friendActionMatch = path.match(/^\/v1\/friends\/([^/]+)\/(accept|decline|cancel)$/);
  if (friendActionMatch && request.method === "POST") {
    const otherId=friendActionMatch[1]!, action=friendActionMatch[2]!;
    if (action === "accept") {
      const result=await env.DB.prepare("UPDATE friend_requests SET status='accepted',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE requester_id=?1 AND recipient_id=?2 AND status='pending'").bind(otherId,user.id).run();
      return result.meta.changes ? { body:{ok:true} } : fail(404,"request_not_found","Friend request not found.");
    }
    const result = action === "decline"
      ? await env.DB.prepare("DELETE FROM friend_requests WHERE requester_id=?1 AND recipient_id=?2 AND status='pending'").bind(otherId,user.id).run()
      : await env.DB.prepare("DELETE FROM friend_requests WHERE requester_id=?1 AND recipient_id=?2 AND status='pending'").bind(user.id,otherId).run();
    return result.meta.changes ? { body:{ok:true} } : fail(404,"request_not_found","Friend request not found.");
  }
  const friendMatch=path.match(/^\/v1\/friends\/([^/]+)$/);
  if(friendMatch && request.method === "DELETE"){
    const otherId=friendMatch[1]!;
    const result=await env.DB.prepare("DELETE FROM friend_requests WHERE status='accepted' AND ((requester_id=?1 AND recipient_id=?2) OR (requester_id=?2 AND recipient_id=?1))").bind(user.id,otherId).run();
    return { body:{ok:result.meta.changes>0} };
  }

  if(path === "/v1/users/search" && request.method === "GET"){
    const query=(url.searchParams.get("q") ?? "").trim().replace(/^@/,"").slice(0,60);
    if(query.length<2) return {body:{users:[]}};
    const pattern=`%${query.toLowerCase()}%`;
    const rows=await env.DB.prepare(`SELECT p.user_id AS id,p.display_name,p.username,p.avatar_key AS avatar_url,p.bio,p.formatted_address AS location,p.favourite_activities_json AS favourite_activities_json,p.created_at
      FROM profiles p WHERE p.user_id<>?1 AND (lower(p.username) LIKE ?2 OR lower(p.display_name) LIKE ?2)
      AND (p.visibility='public' OR EXISTS(SELECT 1 FROM friend_requests f WHERE f.status='accepted' AND ((f.requester_id=?1 AND f.recipient_id=p.user_id) OR (f.requester_id=p.user_id AND f.recipient_id=?1))) OR EXISTS(SELECT 1 FROM circle_members a JOIN circle_members b ON b.circle_id=a.circle_id WHERE a.user_id=?1 AND b.user_id=p.user_id))
      ORDER BY CASE WHEN lower(p.username)=?3 THEN 0 ELSE 1 END,p.display_name LIMIT 20`).bind(user.id,pattern,query.toLowerCase()).all();
    return {body:{users:rows.results.map((row:any)=>({...row,favourite_activities:JSON.parse(String(row.favourite_activities_json??"[]"))}))}};
  }
  const userProfileMatch=path.match(/^\/v1\/users\/([^/]+)$/);
  if(userProfileMatch && request.method==="GET"){
    const targetId=userProfileMatch[1]!;
    const row=await env.DB.prepare("SELECT user_id,username,display_name,avatar_key AS avatar_url,bio,formatted_address,favourite_activities_json,visibility,created_at FROM profiles WHERE user_id=?1").bind(targetId).first<Record<string,unknown>>();
    if(!row) return fail(404,"user_not_found","Profile not found.");
    const canSee=targetId===user.id || row.visibility==="public" || !!await env.DB.prepare("SELECT 1 FROM friend_requests WHERE status='accepted' AND ((requester_id=?1 AND recipient_id=?2) OR (requester_id=?2 AND recipient_id=?1))").bind(user.id,targetId).first() || !!await env.DB.prepare("SELECT 1 FROM circle_members a JOIN circle_members b ON b.circle_id=a.circle_id WHERE a.user_id=?1 AND b.user_id=?2").bind(user.id,targetId).first();
    if(!canSee) return fail(404,"user_not_found","Profile not found.");
    return {body:{profile:{...row,favourite_activities:JSON.parse(String(row.favourite_activities_json??"[]"))}}};
  }

  const usernameMatch=path.match(/^\/v1\/users\/username\/([^/]+)$/);
  if(usernameMatch && request.method === "GET"){
    const row=await env.DB.prepare("SELECT user_id,username,display_name,avatar_key AS avatar_url,bio,formatted_address,favourite_activities_json,visibility FROM profiles WHERE username=?1 COLLATE NOCASE").bind(decodeURIComponent(usernameMatch[1]!)).first<Record<string,unknown>>();
    if(!row) return fail(404,"user_not_found","Profile not found.");
    const targetId=String(row.user_id);
    const canSee=targetId===user.id || row.visibility==="public" || await env.DB.prepare("SELECT 1 FROM friend_requests WHERE status='accepted' AND ((requester_id=?1 AND recipient_id=?2) OR (requester_id=?2 AND recipient_id=?1))").bind(user.id,targetId).first() || await env.DB.prepare("SELECT 1 FROM circle_members a JOIN circle_members b ON b.circle_id=a.circle_id WHERE a.user_id=?1 AND b.user_id=?2").bind(user.id,targetId).first();
    if(!canSee) return fail(404,"user_not_found","Profile not found.");
    return {body:{profile:{...row,favourite_activities:JSON.parse(String(row.favourite_activities_json??"[]"))}}};
  }
  if(path === "/v1/users/username-available" && request.method === "GET"){
    const username=(url.searchParams.get("username")??"").replace(/^@/,"").toLowerCase();
    if(!/^[a-z0-9_]{3,20}$/.test(username)) return {body:{available:false}};
    const row=await env.DB.prepare("SELECT user_id FROM profiles WHERE username=?1 COLLATE NOCASE").bind(username).first<{user_id:string}>();
    return {body:{available:!row || row.user_id===user.id}};
  }

  const candidatesMatch=path.match(/^\/v1\/circles\/([^/]+)\/members\/candidates$/);
  if(candidatesMatch && request.method === "GET"){
    const circleId=candidatesMatch[1]!;
    if(!await memberOf(env,circleId,user.id)) return fail(404,"circle_not_found","Circle not found.");
    const query=(url.searchParams.get("q")??"").trim().replace(/^@/,"").slice(0,60);
    if(query.length<2) return {body:{users:[]}};
    const result=await env.DB.prepare(`SELECT p.user_id AS id,p.display_name,p.username,p.avatar_key AS avatar_url FROM profiles p
      WHERE p.user_id<>?1 AND (lower(p.username) LIKE ?2 OR lower(p.display_name) LIKE ?2)
      AND NOT EXISTS(SELECT 1 FROM circle_members cm WHERE cm.circle_id=?3 AND cm.user_id=p.user_id)
      AND (p.visibility='public' OR EXISTS(SELECT 1 FROM friend_requests f WHERE f.status='accepted' AND ((f.requester_id=?1 AND f.recipient_id=p.user_id) OR (f.requester_id=p.user_id AND f.recipient_id=?1)))) LIMIT 20`).bind(user.id,`%${query.toLowerCase()}%`,circleId).all();
    return {body:{users:result.results}};
  }
  const addByUsernameMatch=path.match(/^\/v1\/circles\/([^/]+)\/members\/by-username$/);
  if(addByUsernameMatch && request.method === "POST"){
    const circleId=addByUsernameMatch[1]!;
    const role=await env.DB.prepare("SELECT role FROM circle_members WHERE circle_id=?1 AND user_id=?2").bind(circleId,user.id).first<{role:string}>();
    if(role?.role!=="owner") return fail(403,"owner_required","Only a Circle owner can add a member.");
    const body=await readJson(request); if(typeof body?.username!=="string") return fail(400,"invalid_username","Choose a Nexus username.");
    const target=await env.DB.prepare("SELECT user_id,display_name,username FROM profiles WHERE username=?1 COLLATE NOCASE").bind(body.username.trim()).first<{user_id:string;display_name:string;username:string}>();
    if(!target) return fail(404,"user_not_found","Nexus member not found.");
    const isFriend=await env.DB.prepare("SELECT 1 FROM friend_requests WHERE status='accepted' AND ((requester_id=?1 AND recipient_id=?2) OR (requester_id=?2 AND recipient_id=?1))").bind(user.id,target.user_id).first();
    if(!isFriend) return fail(403,"friendship_required","Connect as friends before adding this member.");
    await env.DB.prepare("INSERT OR IGNORE INTO circle_members(circle_id,user_id,role) VALUES(?1,?2,'member')").bind(circleId,target.user_id).run();
    return {status:201,body:{user_id:target.user_id,display_name:target.display_name,username:target.username}};
  }

  if(path === "/v1/saved-venues" && request.method === "GET"){
    const circleId=url.searchParams.get("circleId"), placeId=url.searchParams.get("placeId");
    if(circleId && !await memberOf(env,circleId,user.id)) return fail(404,"circle_not_found","Circle not found.");
    if(placeId){
      const rows=await env.DB.prepare("SELECT DISTINCT circle_id FROM saved_venues WHERE user_id=?1 AND place_id=?2").bind(user.id,placeId).all();
      return {body:{circle_ids:rows.results.map((row:any)=>row.circle_id)}};
    }
    const rows=circleId
      ? await env.DB.prepare(`SELECT id,circle_id AS group_id,place_id,venue_name,venue_category,venue_photo_url,map_url,venue_lat,venue_lng,venue_address,venue_rating,created_at FROM saved_venues WHERE circle_id=?1 AND EXISTS(SELECT 1 FROM circle_members cm WHERE cm.circle_id=saved_venues.circle_id AND cm.user_id=?2) ORDER BY created_at DESC`).bind(circleId,user.id).all()
      : await env.DB.prepare(`SELECT c.id,c.name,c.emoji FROM circles c JOIN circle_members cm ON cm.circle_id=c.id WHERE cm.user_id=?1 ORDER BY c.created_at DESC`).bind(user.id).all();
    return circleId ? {body:{venues:rows.results}} : {body:{groups:rows.results}};
  }
  if(path === "/v1/saved-venues" && request.method === "POST"){
    const body=await readJson(request);
    if(typeof body?.circleId!=="string" || !await memberOf(env,body.circleId,user.id)) return fail(404,"circle_not_found","Circle not found.");
    if(typeof body.placeId!=="string" || body.placeId.length<1 || body.placeId.length>500 || typeof body.name!=="string" || !body.name.trim() || body.name.length>180) return fail(400,"invalid_venue","Venue details are invalid.");
    const lat=body.lat, lng=body.lng;
    if((lat!=null && (typeof lat!=="number" || lat < -90 || lat > 90)) || (lng!=null && (typeof lng!=="number" || lng < -180 || lng > 180))) return fail(400,"invalid_venue","Venue coordinates are invalid.");
    const rowId=id();
    await env.DB.prepare(`INSERT INTO saved_venues(id,user_id,circle_id,place_id,venue_name,venue_category,venue_photo_url,map_url,venue_lat,venue_lng,venue_address,venue_rating)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(user_id,circle_id,place_id) DO UPDATE SET venue_name=excluded.venue_name,venue_category=excluded.venue_category,venue_photo_url=excluded.venue_photo_url,map_url=excluded.map_url,venue_lat=excluded.venue_lat,venue_lng=excluded.venue_lng,venue_address=excluded.venue_address,venue_rating=excluded.venue_rating`).bind(rowId,user.id,body.circleId,body.placeId,body.name.trim(),typeof body.category==="string"?body.category:null,typeof body.photoUrl==="string"?body.photoUrl:null,typeof body.mapUrl==="string"?body.mapUrl:null,lat??null,lng??null,typeof body.address==="string"?body.address:null,typeof body.rating==="number"?body.rating:null).run();
    return {status:201,body:{ok:true}};
  }
  if(path === "/v1/saved-venues" && request.method === "DELETE"){
    const circleId=url.searchParams.get("circleId"), placeId=url.searchParams.get("placeId");
    if(!circleId || !placeId) return fail(400,"invalid_saved_venue","Specify a Circle and venue.");
    const result=await env.DB.prepare("DELETE FROM saved_venues WHERE user_id=?1 AND circle_id=?2 AND place_id=?3").bind(user.id,circleId,placeId).run();
    return {body:{ok:result.meta.changes>0}};
  }
  const savedVenueMatch=path.match(/^\/v1\/saved-venues\/([^/]+)$/);
  if(savedVenueMatch && request.method === "DELETE"){
    const result=await env.DB.prepare("DELETE FROM saved_venues WHERE id=?1 AND user_id=?2").bind(savedVenueMatch[1]!,user.id).run();
    return result.meta.changes?{body:{ok:true}}:fail(404,"saved_venue_not_found","Saved venue not found.");
  }

  if(path === "/v1/live-events/transitions" && request.method === "POST"){
    const rows=await env.DB.prepare(`SELECT e.* FROM live_events e JOIN live_event_members em ON em.event_id=e.id WHERE em.user_id=?1 AND e.status IN ('pending','live')`).bind(user.id).all<Record<string,unknown>>();
    let activated=0,deactivated=0;
    const now=new Date().toISOString();
    for(const row of rows.results){
      const event=parseLiveEvent(row); const eventId=String(row.id);
      if(row.status==="pending" && String(row.window_start)<=now){
        const update=await env.DB.prepare("UPDATE live_events SET status='live',activated_at=?1,updated_at=?1 WHERE id=?2 AND status='pending'").bind(now,eventId).run();
        if(update.meta.changes){activated++; await eventNotification(env,eventId,user.id,"event_started",{title:row.title});}
      }else if(row.status==="live" && String(row.window_end)<=now){
        const update=await env.DB.prepare("UPDATE live_events SET status='ended',ended_at=?1,updated_at=?1 WHERE id=?2 AND status='live'").bind(now,eventId).run();
        if(update.meta.changes){deactivated++; await eventNotification(env,eventId,user.id,"event_ended",{title:row.title});}
      }
    }
    return {body:{activated,deactivated}};
  }

  const circleEventsMatch=path.match(/^\/v1\/circles\/([^/]+)\/live-events$/);
  if(circleEventsMatch){
    const circleId=circleEventsMatch[1]!;
    if(!await memberOf(env,circleId,user.id)) return fail(404,"circle_not_found","Circle not found.");
    if(request.method==="GET"){
      const rows=await env.DB.prepare("SELECT * FROM live_events WHERE circle_id=?1 ORDER BY window_start DESC LIMIT 50").bind(circleId).all<Record<string,unknown>>();
      return {body:{events:rows.results.map(parseLiveEvent)}};
    }
    if(request.method==="POST"){
      if(!await rateLimit(env,`${user.id}:schedule-event`,20,3600)) return fail(429,"rate_limited","Too many live events. Try again later.");
      const body=await readJson(request);
      if(typeof body?.windowStart!=="string" || typeof body.windowEnd!=="string" || !Number.isFinite(Date.parse(body.windowStart)) || !Number.isFinite(Date.parse(body.windowEnd)) || Date.parse(body.windowEnd)<=Date.parse(body.windowStart) || Date.parse(body.windowEnd)-Date.parse(body.windowStart)>24*3600_000) return fail(400,"invalid_event_window","Choose a valid live event window of 24 hours or less.");
      const title=typeof body.title==="string"?body.title.trim():"Group Meetup";
      if(!title || title.length>120) return fail(400,"invalid_event","Event title must be 1 to 120 characters.");
      const stops=Array.isArray(body.stops)?body.stops:[];
      if(stops.length>30 || !stops.every((stop:any,index:number)=>stop && typeof stop==="object" && typeof stop.name==="string" && stop.name.length<=160 && Number.isInteger(stop.duration_minutes) && stop.duration_minutes>=1 && stop.duration_minutes<=720 && (stop.order===undefined || stop.order===index) && (stop.latitude===undefined || (typeof stop.latitude==="number"&&stop.latitude>=-90&&stop.latitude<=90)) && (stop.longitude===undefined || (typeof stop.longitude==="number"&&stop.longitude>=-180&&stop.longitude<=180)))) return fail(400,"invalid_stops","Event stops are invalid.");
      const allMembers=await env.DB.prepare("SELECT user_id FROM circle_members WHERE circle_id=?1").bind(circleId).all<{user_id:string}>();
      const requested=Array.isArray(body.invitedMemberIds)&&body.invitedMemberIds.every((v:any)=>typeof v==="string")?body.invitedMemberIds as string[]:[];
      const allowed=new Set(allMembers.results.map((m)=>m.user_id));
      if(requested.some((member)=>!allowed.has(member))) return fail(400,"invalid_invitees","Every invited person must belong to this Circle.");
      const invitees=[...new Set([user.id,...(requested.length?requested:allMembers.results.map((m)=>m.user_id))])];
      const eventId=id(), starts=new Date(body.windowStart).toISOString(), ends=new Date(body.windowEnd).toISOString();
      const radius=Number.isInteger(body.arrivalRadiusM)?Math.max(10,Math.min(500,body.arrivalRadiusM as number)):50;
      const golden=body.goldenWindowData&&typeof body.goldenWindowData==="object"?body.goldenWindowData:{};
      await env.DB.batch([
        env.DB.prepare("INSERT INTO live_events(id,circle_id,title,description,window_start,window_end,golden_window_data_json,stops_json,host_id,arrival_radius_metres,invited_member_ids_json,created_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?9)").bind(eventId,circleId,title,typeof body.description==="string"?body.description.slice(0,1000):null,starts,ends,JSON.stringify(golden),JSON.stringify(stops),user.id,radius,JSON.stringify(invitees)),
        ...invitees.map((member)=>env.DB.prepare("INSERT INTO live_event_members(event_id,user_id) VALUES(?1,?2)").bind(eventId,member)),
      ]);
      await eventNotification(env,eventId,user.id,"plan_shared",{title,window_start:starts});
      const row=await env.DB.prepare("SELECT * FROM live_events WHERE id=?1").bind(eventId).first<Record<string,unknown>>();
      return {status:201,body:{event:row?parseLiveEvent(row):null}};
    }
  }

  const liveEventMatch=path.match(/^\/v1\/live-events\/([^/]+)(?:\/([^/]+))?$/);
  if(liveEventMatch){
    const eventId=liveEventMatch[1]!, action=liveEventMatch[2]??"";
    const row=await env.DB.prepare("SELECT * FROM live_events WHERE id=?1").bind(eventId).first<Record<string,unknown>>();
    if(!row || !await eventMember(env,eventId,user.id)) return fail(404,"event_not_found","Live event not found.");
    const event=parseLiveEvent(row); const host=row.host_id===user.id;
    if(!action && request.method==="GET"){
      const [presence,locations,notifs]=await Promise.all([
        env.DB.prepare("SELECT * FROM member_presence WHERE event_id=?1 ORDER BY updated_at").bind(eventId).all(),
        env.DB.prepare("SELECT user_id,latitude,longitude,accuracy,heading,speed,recorded_at FROM live_locations WHERE event_id=?1").bind(eventId).all(),
        env.DB.prepare("SELECT id,event_id,type,actor_user_id,target_user_id,payload_json,created_at FROM event_notifications WHERE event_id=?1 AND target_user_id=?2 ORDER BY created_at DESC LIMIT 50").bind(eventId,user.id).all(),
      ]);
      return {body:{event:{...event,presence:presence.results,locations:row.sharing_enabled && row.status === "live"?locations.results:[],notifications:notifs.results.map((n:any)=>({...n,payload:JSON.parse(String(n.payload_json??"{}"))}))}}};
    }
    if(action==="live" && request.method==="GET"){
      if(request.headers.get("upgrade")?.toLowerCase()!=="websocket") return fail(426,"websocket_required","This route requires a WebSocket connection.");
      const room=env.LIVE_EVENT_ROOM.get(env.LIVE_EVENT_ROOM.idFromName(eventId));
      return room.fetch(new Request("https://live-event.internal/connect",request));
    }
    if(action==="locations" && request.method==="GET"){
      if(!row.sharing_enabled || row.status !== "live") return {body:{locations:[]}};
      const result=await env.DB.prepare("SELECT user_id,latitude,longitude,accuracy,heading,speed,recorded_at FROM live_locations WHERE event_id=?1").bind(eventId).all();
      return {body:{locations:result.results}};
    }
    if(action==="locations" && request.method==="POST"){
      if(row.status!=="live" || !row.sharing_enabled) return fail(409,"sharing_unavailable","Location sharing is not active for this event.");
      if(!await rateLimit(env,`${eventId}:${user.id}:location`,8,60)) return fail(429,"location_rate_limited","Location updates are arriving too quickly.");
      const body=await readJson(request);
      if(typeof body?.latitude!=="number" || body.latitude < -90 || body.latitude > 90 || typeof body.longitude!=="number" || body.longitude < -180 || body.longitude > 180) return fail(400,"invalid_location","Location coordinates are invalid.");
      const recorded=typeof body.recordedAt==="string"&&Number.isFinite(Date.parse(body.recordedAt))?new Date(body.recordedAt):new Date();
      if(Math.abs(Date.now()-recorded.getTime())>2*60_000) return fail(400,"stale_location","Location update is too old.");
      await env.DB.prepare(`INSERT INTO live_locations(event_id,user_id,latitude,longitude,accuracy,heading,speed,recorded_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
        ON CONFLICT(event_id,user_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,heading=excluded.heading,speed=excluded.speed,recorded_at=excluded.recorded_at`).bind(eventId,user.id,body.latitude,body.longitude,typeof body.accuracy==="number"?body.accuracy:null,typeof body.heading==="number"?body.heading:null,typeof body.speed==="number"?body.speed:null,recorded.toISOString()).run();
      const location={id:`${eventId}:${user.id}`,event_id:eventId,user_id:user.id,latitude:body.latitude,longitude:body.longitude,accuracy:body.accuracy??null,heading:body.heading??null,speed:body.speed??null,recorded_at:recorded.toISOString(),created_at:recorded.toISOString()};
      await publishLiveEvent(env,eventId,"location",location);
      return {body:{location}};
    }
    if(action==="presence" && request.method==="GET"){
      const result=await env.DB.prepare("SELECT * FROM member_presence WHERE event_id=?1 ORDER BY updated_at").bind(eventId).all();
      return {body:{presence:result.results}};
    }
    if(action==="presence" && request.method==="PUT"){
      const body=await readJson(request); const statuses=["travelling","arrived","running_late","offline","left_event"];
      if(!body || typeof body.status !== "string" || !statuses.includes(body.status)) return fail(400,"invalid_presence","Presence status is invalid.");
      if(row.status!=="live" && body?.status!=="offline" && body?.status!=="left_event") return fail(409,"event_not_live","Presence can be updated while the event is live.");
      const stop=body?.currentStopIndex;
      const distance=body?.distanceMetres;
      const eta=body?.etaMinutes;
      const stopValue = typeof stop === "number" && Number.isInteger(stop) ? stop : null;
      const etaValue = typeof eta === "number" && Number.isInteger(eta) ? Math.max(0, Math.min(1440, eta)) : null;
      const distanceValue = typeof distance === "number" && Number.isFinite(distance) ? Math.max(0, Math.min(1_000_000, distance)) : null;
      await env.DB.prepare(`INSERT INTO member_presence(event_id,user_id,status,current_stop_index,distance_metres,eta_minutes,last_seen_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status,current_stop_index=excluded.current_stop_index,distance_metres=excluded.distance_metres,eta_minutes=excluded.eta_minutes,last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at`).bind(eventId,user.id,body.status,stopValue,distanceValue,etaValue).run();
      const presence=await env.DB.prepare("SELECT * FROM member_presence WHERE event_id=?1 AND user_id=?2").bind(eventId,user.id).first();
      await publishLiveEvent(env,eventId,"presence",presence);
      return {body:{presence}};
    }
    if(action==="notifications" && request.method==="GET"){
      const rows=await env.DB.prepare("SELECT id,event_id,type,actor_user_id,target_user_id,payload_json,created_at FROM event_notifications WHERE event_id=?1 AND target_user_id=?2 ORDER BY created_at DESC LIMIT 50").bind(eventId,user.id).all();
      return {body:{notifications:rows.results.map((n:any)=>({...n,payload:JSON.parse(String(n.payload_json??"{}"))}))}};
    }
    if(action==="notifications" && request.method==="POST"){
      if(!await rateLimit(env,`${eventId}:${user.id}:event-notification`,20,3600)) return fail(429,"rate_limited","Too many event updates. Try again later.");
      const body=await readJson(request);
      const allowedMemberUpdates = new Set(["member_arrived","member_late","next_stop_soon","member_left"]);
      if(typeof body?.type!=="string" || !allowedMemberUpdates.has(body.type)) return fail(403,"host_action_required","This event update can only be created by an authorised event action.");
      const submitted=body.payload && typeof body.payload==="object" && !Array.isArray(body.payload)?body.payload as Record<string,unknown>:{};
      const payload:Record<string,unknown>={};
      if(body.type==="member_arrived" || body.type==="member_late" || body.type==="member_left") payload.display_name=user.display_name;
      for(const key of ["stop_index","minutes_until"]){if(Number.isInteger(submitted[key])) payload[key]=submitted[key];}
      if(typeof submitted.stop_name==="string") payload.stop_name=submitted.stop_name.slice(0,160);
      if(body.type==="member_late" && typeof submitted.eta_minutes==="number" && Number.isInteger(submitted.eta_minutes)) payload.eta_minutes=Math.max(0,Math.min(1440,submitted.eta_minutes));
      const notification=await eventNotification(env,eventId,user.id,body.type,payload,null);
      return {status:201,body:{notification}};
    }
    if(action==="cancel" && request.method==="POST"){
      if(!host) return fail(403,"host_required","Only the event host can cancel this event.");
      if(row.status==="ended" || row.status==="cancelled") return fail(409,"event_closed","This event is already closed.");
      const now=new Date().toISOString();
      await env.DB.prepare("UPDATE live_events SET status='cancelled',cancelled_at=?1,updated_at=?1 WHERE id=?2").bind(now,eventId).run();
      await eventNotification(env,eventId,user.id,"event_ended",{cancelled:true,title:row.title});
      return {body:{success:true}};
    }
    if(action==="activate" || action==="deactivate") return fail(410,"use_transitions_endpoint","Use the live event transition endpoint.");
    if(["skip-stop","delay-stop","end","share"].includes(action) && request.method==="POST"){
      if(!host) return fail(403,"host_required","Only the event host can manage this plan.");
      const body=await readJson(request)??{}; const now=new Date().toISOString();
      if(action==="skip-stop"){
        const stops=Array.isArray(event.stops)?event.stops as Array<Record<string,unknown>>:[];
        const nextIndex=Math.min(stops.length,Number(row.current_stop_index)+1);
        await env.DB.prepare("UPDATE live_events SET current_stop_index=?1,updated_at=?2 WHERE id=?3 AND status='live'").bind(nextIndex,now,eventId).run();
        await eventNotification(env,eventId,user.id,"stop_skipped",{stop_index:nextIndex,stop_name:(stops[nextIndex] as any)?.name??null});
      }else if(action==="delay-stop"){
        const minutes=Number(body.delayMinutes); if(!Number.isInteger(minutes)||minutes<1||minutes>120) return fail(400,"invalid_delay","Delay must be between 1 and 120 minutes.");
        const stops=Array.isArray(event.stops)?event.stops as Array<Record<string,unknown>>:[]; const index=Number(row.current_stop_index);
        if(!stops[index]) return fail(409,"no_current_stop","There is no current stop to delay.");
        stops[index]={...stops[index],duration_minutes:Number(stops[index].duration_minutes)+minutes};
        await env.DB.prepare("UPDATE live_events SET stops_json=?1,updated_at=?2 WHERE id=?3 AND status='live'").bind(JSON.stringify(stops),now,eventId).run();
        await eventNotification(env,eventId,user.id,"stop_delayed",{delay_minutes:minutes,stop_index:index});
      }else if(action==="end"){
        await env.DB.prepare("UPDATE live_events SET status='ended',ended_at=?1,updated_at=?1 WHERE id=?2 AND status='live'").bind(now,eventId).run();
        await eventNotification(env,eventId,user.id,"event_ended",{title:row.title});
      }else{
        await eventNotification(env,eventId,user.id,"plan_shared",{title:row.title,stops:event.stops});
      }
      const updated=await env.DB.prepare("SELECT * FROM live_events WHERE id=?1").bind(eventId).first<Record<string,unknown>>();
      return {body:{event:updated?parseLiveEvent(updated):null}};
    }
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
    if (!await rateLimit(env, `${user.id}:circle-invite`, 20, 3600)) return fail(429, "rate_limited", "Too many invitations. Try again later.");
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
      if (body.goldenWindow === true) {
        const members = await env.DB.prepare("SELECT u.id,u.id AS name FROM circle_members cm JOIN users u ON u.id=cm.user_id WHERE cm.circle_id=?1").bind(circleId).all<GoldenWindowMember>();
        const availability = await env.DB.prepare("SELECT user_id,day_of_week,start_time,end_time FROM availability WHERE circle_id=?1").bind(circleId).all<GoldenWindowAvailabilityRow>();
        const best = computeGoldenWindows(members.results, availability.results)[0];
        if (!best) return fail(409, "availability_required", "Add availability from at least two Circle members before making this plan.");
        const startsAt = new Date(body.startsAt);
        const requested = body.window && typeof body.window === "object" ? body.window as Record<string, unknown> : {};
        if (requested.dayOfWeek !== best.day_of_week || requested.startTime !== best.start_time || requested.endTime !== best.end_time) return fail(409, "golden_window_changed", "Availability changed. Find the Golden Window again before confirming this plan.");
        const endsAt = typeof body.endsAt === "string" && Number.isFinite(Date.parse(body.endsAt)) ? new Date(body.endsAt) : new Date(startsAt.getTime() + best.duration_minutes * 60_000);
        if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60_000) return fail(400, "invalid_plan", "Plan end time must follow its start time within 24 hours.");
        const key = `${startsAt.toISOString().slice(0, 16)}:${best.day_of_week}:${best.start_time}:${best.end_time}`;
        const planId = id();
        await env.DB.prepare("INSERT OR IGNORE INTO plans(id,circle_id,created_by,title,starts_at,ends_at,venue_snapshot_json,status,golden_window_key) VALUES(?1,?2,?3,?4,?5,?6,?7,'proposed',?8)")
          .bind(planId, circleId, user.id, body.title.trim(), startsAt.toISOString(), endsAt.toISOString(), body.venue && typeof body.venue === "object" ? JSON.stringify(body.venue) : null, key).run();
        const plan = await env.DB.prepare("SELECT id,circle_id,created_by,title,starts_at,ends_at,status FROM plans WHERE circle_id=?1 AND golden_window_key=?2").bind(circleId, key).first<Record<string, unknown>>();
        if (!plan) return fail(500, "plan_create_failed", "Could not create the Circle plan.");
        if (plan.created_by === user.id && plan.id === planId) await notifyCircleMembers(env, circleId, user.id, "plan_proposed", { title: plan.title, starts_at: plan.starts_at }, String(plan.id));
        return { status: plan.id === planId ? 201 : 200, body: { plan } };
      }
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
      if (!await rateLimit(env, `${user.id}:${circleId}:chat-message`, 40, 60)) return fail(429, "rate_limited", "You are sending messages too quickly.");
      const body = await readJson(request);
      const validTypes = ["text","system","route","location","poll","image"];
      const messageType = typeof body?.messageType === "string" && validTypes.includes(body.messageType) ? body.messageType : "text";
      if (messageType === "system" || typeof body?.body !== "string" || body.body.trim().length < 1 || body.body.length > 4000 || (messageType !== "text" && !body.metadata)) return fail(400, "invalid_message", "Message content is invalid.");
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
      if (typeof body?.venueName !== "string" || body.venueName.trim().length < 1 || body.venueName.length > 120 || !([1,-1,0] as unknown[]).includes(body?.vote)) return fail(400, "invalid_vote", "Choose a venue and vote.");
      let venueId = typeof body.venueId === "string" ? body.venueId : null;
      if (venueId && !await env.DB.prepare("SELECT 1 FROM venues WHERE id=?1").bind(venueId).first()) return fail(404, "venue_not_found", "Venue was not found.");
      if (!venueId) {
        const providerVenueId = typeof body.providerVenueId === "string" && body.providerVenueId.length <= 300 ? body.providerVenueId : body.venueName.trim().toLowerCase();
        const stableKey = `${planId}:${providerVenueId}`;
        await env.DB.prepare("INSERT OR IGNORE INTO venues(id,provider,provider_venue_id,name,venue_type,location_json,price_level,details_json) VALUES(?1,'nexus-suggestion',?2,?3,?4,?5,?6,'{}')")
          .bind(id(), stableKey, body.venueName.trim(), typeof body.venueType === "string" ? body.venueType.slice(0, 120) : null, body.location && typeof body.location === "object" ? JSON.stringify(body.location) : null, Number.isInteger(body.priceLevel) ? body.priceLevel : null).run();
        const venue = await env.DB.prepare("SELECT id FROM venues WHERE provider='nexus-suggestion' AND provider_venue_id=?1").bind(stableKey).first<{ id: string }>();
        venueId = venue?.id ?? null;
      }
      if (!venueId) return fail(500, "venue_not_saved", "Could not save this venue vote.");
      if (body.vote === 0) await env.DB.prepare("DELETE FROM venue_votes WHERE plan_id=?1 AND venue_id=?2 AND user_id=?3").bind(planId, venueId, user.id).run();
      else await env.DB.prepare("INSERT INTO venue_votes(plan_id,venue_id,user_id,vote) VALUES(?1,?2,?3,?4) ON CONFLICT(plan_id,venue_id,user_id) DO UPDATE SET vote=excluded.vote,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(planId, venueId, user.id, body.vote).run();
      return { body: { ok: true, venue_id: venueId } };
    }
    if (action === "confirm" && request.method === "POST") {
      const body = await readJson(request);
      if (plan.status === "cancelled") return fail(409, "plan_cancelled", "Cancelled plans cannot be confirmed.");
      const venueId = typeof body?.venueId === "string" ? body.venueId : null;
      if (venueId && !await env.DB.prepare("SELECT 1 FROM venue_votes WHERE venue_id=?1 AND plan_id=?2 AND vote=1").bind(venueId, planId).first()) return fail(400, "venue_not_proposed", "A Circle member must vote for this venue before confirming it.");
      if (plan.status === "cancelled") return fail(409, "plan_cancelled", "Cancelled plans cannot be confirmed.");
      if (plan.status === "confirmed") {
        const current = await env.DB.prepare("SELECT venue_id FROM plans WHERE id=?1").bind(planId).first<{ venue_id: string | null }>();
        if (venueId && current?.venue_id !== venueId) return fail(409, "plan_already_confirmed", "This plan has already been confirmed at another venue.");
        await env.DB.prepare("INSERT INTO rsvps(plan_id,user_id,response) VALUES(?1,?2,'yes') ON CONFLICT(plan_id,user_id) DO UPDATE SET response='yes',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(planId,user.id).run();
        return { body: { ok: true, status: "confirmed", rsvp: "yes" } };
      }
      const [updated] = await env.DB.batch([
        env.DB.prepare("UPDATE plans SET status='confirmed',venue_id=COALESCE(?1,venue_id),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND status='proposed'").bind(venueId, planId),
        env.DB.prepare("INSERT INTO rsvps(plan_id,user_id,response) VALUES(?1,?2,'yes') ON CONFLICT(plan_id,user_id) DO UPDATE SET response='yes',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(planId,user.id),
      ]);
      if (updated?.meta.changes) await notifyCircleMembers(env, plan.circle_id, user.id, "plan_confirmed", { venue_id: venueId }, planId);
      return { body: { ok: true, status: "confirmed", rsvp: "yes" } };
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
    // Staging deliberately keeps R2 writes disabled. Reject before parsing a
    // multipart body so no object or metadata row can be created accidentally.
    if (env.ALLOW_UPLOADS !== "true" || !env.UPLOADS) return fail(503, "uploads_disabled", "File uploads are not available in this staging environment.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 10 * 1024 * 1024 || !["image/jpeg","image/png","image/webp"].includes(file.type)) return fail(400, "invalid_upload", "Upload a JPG, PNG or WebP image up to 10 MB.");
    const avatar = form.get("kind") === "avatar";
    const circleId = form.get("circleId");
    if (!avatar && (typeof circleId !== "string" || !await memberOf(env, circleId, user.id))) return fail(403, "circle_membership_required", "Join the Circle before uploading a chat image.");
    if (avatar && (file.type !== "image/jpeg" || file.size > 2 * 1024 * 1024)) return fail(400,"invalid_avatar","Avatar must be a JPEG no larger than 2 MB.");
    const key = avatar ? `avatars/${user.id}/${id()}.jpg` : `${circleId}/${user.id}/${id()}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`;
    await env.UPLOADS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await env.DB.prepare("INSERT INTO upload_metadata(object_key,owner_id,circle_id,content_type,size_bytes) VALUES(?1,?2,?3,?4,?5)").bind(key, user.id, avatar ? null : circleId, file.type, file.size).run();
    return { status: 201, body: { key, source: "private R2 object" } };
  }

  const avatarDelete=path.match(/^\/v1\/avatars\/([^/]+)$/);
  if(avatarDelete && request.method==="DELETE"){
    if(avatarDelete[1]!==user.id) return fail(403,"own_avatar_only","You can only remove your own avatar.");
    const row=await env.DB.prepare("SELECT avatar_key FROM profiles WHERE user_id=?1").bind(user.id).first<{avatar_key:string|null}>();
    if(row?.avatar_key){if(env.UPLOADS) await env.UPLOADS.delete(row.avatar_key);await env.DB.prepare("DELETE FROM upload_metadata WHERE object_key=?1 AND owner_id=?2").bind(row.avatar_key,user.id).run();}
    await env.DB.prepare("UPDATE profiles SET avatar_key=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?1").bind(user.id).run();
    return {body:{ok:true}};
  }

  const avatarMatch=path.match(/^\/v1\/avatars\/([^/]+)$/);
  if(avatarMatch && request.method==="GET"){
    const targetId=avatarMatch[1]!;
    const profile=await env.DB.prepare("SELECT avatar_key,visibility FROM profiles WHERE user_id=?1").bind(targetId).first<{avatar_key:string|null;visibility:string}>();
    if(!profile?.avatar_key) return fail(404,"avatar_not_found","Avatar not found.");
    const canSee=targetId===user.id || profile.visibility==="public" || !!await env.DB.prepare("SELECT 1 FROM friend_requests WHERE status='accepted' AND ((requester_id=?1 AND recipient_id=?2) OR (requester_id=?2 AND recipient_id=?1))").bind(user.id,targetId).first() || !!await env.DB.prepare("SELECT 1 FROM circle_members a JOIN circle_members b ON b.circle_id=a.circle_id WHERE a.user_id=?1 AND b.user_id=?2").bind(user.id,targetId).first();
    if(!canSee) return fail(404,"avatar_not_found","Avatar not found.");
    const object=await env.UPLOADS?.get(profile.avatar_key);
    return object?new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType??"image/jpeg","cache-control":"private,max-age=300","x-content-type-options":"nosniff"}}):fail(404,"avatar_not_found","Avatar not found.");
  }

  const uploadMatch = path.match(/^\/v1\/uploads\/(.+)$/);
  if (uploadMatch && request.method === "GET") {
    const key = decodeURIComponent(uploadMatch[1]!);
    const metadata = await env.DB.prepare("SELECT circle_id,content_type FROM upload_metadata WHERE object_key=?1").bind(key).first<{ circle_id: string | null; content_type: string }>();
    if (!metadata?.circle_id || !await memberOf(env, metadata.circle_id, user.id)) return fail(404, "upload_not_found", "Image not found.");
    const object = await env.UPLOADS?.get(key);
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
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState) { this.state = state; }

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
