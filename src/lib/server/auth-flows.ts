import { createServerFn } from "@tanstack/react-start";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isEmail, normalizeEmail, passwordValid } from "@/lib/kakeibo/password";
import { hashToken, hoursFromNow, minutesFromNow, newToken } from "./tokens";
import { AppError, ForbiddenError } from "./errors";

const GENERIC_AUTH = "auth_failed";
const LOCK_MINUTES = 15;
const MAX_FAILURES = 5;

type UserRow = { id: string; email: string; emailVerified: boolean };

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const sql = await getSql();
  const rows = await sql<UserRow>`
    select id, email, "emailVerified" as "emailVerified"
    from "user"
    where email = ${email}
    limit 1
  `;
  return rows[0] ?? null;
}

async function findUserById(id: string): Promise<UserRow | null> {
  const sql = await getSql();
  const rows = await sql<UserRow>`
    select id, email, "emailVerified" as "emailVerified"
    from "user"
    where id = ${id}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function isCredentialUser(userId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ providerId: string }>`
    select "providerId" as "providerId" from account where "userId" = ${userId}
  `;
  return rows.some((r) => r.providerId === "credential");
}

export async function ensureVerifiedForAuthKind(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) return false;
  if (user.emailVerified) return true;
  const credential = await isCredentialUser(userId);
  if (!credential) {
    const sql = await getSql();
    await sql`update "user" set "emailVerified" = true, "updatedAt" = now() where id = ${userId}`;
    return true;
  }
  return false;
}

export async function requireVerified(userId: string): Promise<void> {
  const ok = await ensureVerifiedForAuthKind(userId);
  if (!ok) throw new ForbiddenError("unverified");
}

export const prepareLogin = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email ?? "");
    if (!isEmail(email)) return { allowed: true as const };
    const sql = await getSql();
    const rows = await sql<{ failed_count: number; locked_until: string | Date | null }>`
      select failed_count, locked_until from login_lockouts where email = ${email}
    `;
    const row = rows[0];
    if (!row?.locked_until) return { allowed: true as const };
    const until = new Date(row.locked_until).getTime();
    if (Number.isFinite(until) && until > Date.now()) {
      return { allowed: false as const };
    }
    await sql`
      update login_lockouts
      set failed_count = 0, locked_until = null, updated_at = now()
      where email = ${email}
    `;
    return { allowed: true as const };
  });

export const recordLoginAttempt = createServerFn({ method: "POST" })
  .validator((data: { email: string; success: boolean }) => data)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email ?? "");
    if (!isEmail(email)) return { ok: true };
    const sql = await getSql();
    if (data.success) {
      await sql`
        insert into login_lockouts (email, failed_count, locked_until, updated_at)
        values (${email}, 0, null, now())
        on conflict (email) do update
          set failed_count = 0, locked_until = null, updated_at = now()
      `;
      return { ok: true };
    }
    const existing = await sql<{ failed_count: number }>`
      select failed_count from login_lockouts where email = ${email}
    `;
    const next = (existing[0]?.failed_count ?? 0) + 1;
    if (next >= MAX_FAILURES) {
      const until = minutesFromNow(LOCK_MINUTES).toISOString();
      await sql`
        insert into login_lockouts (email, failed_count, locked_until, updated_at)
        values (${email}, 0, ${until}, now())
        on conflict (email) do update
          set failed_count = 0, locked_until = ${until}, updated_at = now()
      `;
    } else {
      await sql`
        insert into login_lockouts (email, failed_count, locked_until, updated_at)
        values (${email}, ${next}, null, now())
        on conflict (email) do update
          set failed_count = ${next}, updated_at = now()
      `;
    }
    return { ok: true };
  });

async function issueEmailToken(userId: string): Promise<string> {
  const sql = await getSql();
  const token = newToken();
  const tokenHash = hashToken(token);
  const expires = hoursFromNow(24).toISOString();
  await sql`
    insert into email_verifications (id, user_id, token_hash, expires_at)
    values (${crypto.randomUUID()}, ${userId}, ${tokenHash}, ${expires})
  `;
  return token;
}

export const issueVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const token = await issueEmailToken(context.userId);
    return { token };
  });

export const resendVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const verified = await ensureVerifiedForAuthKind(context.userId);
    if (verified) return { token: null as string | null, already: true };
    const token = await issueEmailToken(context.userId);
    return { token, already: false };
  });

export const consumeVerification = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const token = (data.token ?? "").trim();
    if (!token) throw new AppError("invalid_token", "invalid", 400);
    const sql = await getSql();
    const tokenHash = hashToken(token);
    const rows = await sql<{
      id: string;
      user_id: string;
      expires_at: string | Date;
      used_at: string | Date | null;
    }>`
      select id, user_id, expires_at, used_at
      from email_verifications
      where token_hash = ${tokenHash}
      order by expires_at desc
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new AppError("invalid_token", "invalid", 400);
    if (row.used_at) {
      const user = await findUserById(row.user_id);
      if (user?.emailVerified) return { ok: true };
      throw new AppError("invalid_token", "invalid", 400);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError("expired_token", "expired", 400);
    }
    await sql`update email_verifications set used_at = now() where id = ${row.id}`;
    await sql`update "user" set "emailVerified" = true, "updatedAt" = now() where id = ${row.user_id}`;
    return { ok: true };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email ?? "");
    const dummy = newToken();
    if (!isEmail(email)) return { token: dummy };
    const user = await findUserByEmail(email);
    if (!user) return { token: dummy };
    const sql = await getSql();
    const token = newToken();
    const expires = hoursFromNow(1).toISOString();
    await sql`
      insert into password_reset_tokens (id, user_id, token_hash, expires_at)
      values (${crypto.randomUUID()}, ${user.id}, ${hashToken(token)}, ${expires})
    `;
    return { token };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .validator((data: { token: string; password: string }) => data)
  .handler(async ({ data }) => {
    const token = (data.token ?? "").trim();
    const password = data.password ?? "";
    if (!passwordValid(password)) {
      throw new AppError("weak_password", "weak", 400);
    }
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      user_id: string;
      expires_at: string | Date;
      used_at: string | Date | null;
    }>`
      select id, user_id, expires_at, used_at
      from password_reset_tokens
      where token_hash = ${hashToken(token)}
      order by expires_at desc
      limit 1
    `;
    const row = rows[0];
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError("invalid_token", "invalid", 400);
    }
    const hash = await hashPassword(password);
    const updated = await sql`
      update account
      set password = ${hash}, "updatedAt" = now()
      where "userId" = ${row.user_id} and "providerId" = 'credential'
      returning id
    `;
    if (updated.length === 0) {
      throw new AppError("invalid_token", "invalid", 400);
    }
    await sql`update password_reset_tokens set used_at = now() where id = ${row.id}`;
    return { ok: true };
  });

export const getAuthFlags = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const verified = await ensureVerifiedForAuthKind(context.userId);
    const user = await findUserById(context.userId);
    return {
      userId: context.userId,
      email: user?.email ?? null,
      emailVerified: verified,
    };
  });
