import type { Request, Response, NextFunction } from 'express';
import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../http.js';

export type CurrentUser = { id: string; email: string; displayName: string | null; isAdmin: boolean };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: CurrentUser } }
}

type ExternalIdentity = { subject: string; email: string; name: string | null };

const clerkEmailCache = new Map<string, ExternalIdentity>();

async function externalIdentity(req: Request): Promise<ExternalIdentity | null> {
  if (config.authMode === 'dev') {
    const email = (req.cookies?.dev_user as string | undefined)?.toLowerCase();
    return email ? { subject: `dev:${email}`, email, name: null } : null;
  }
  const { userId } = getAuth(req);
  if (!userId) return null;
  const cached = clerkEmailCache.get(userId);
  if (cached) return cached;
  const u = await clerkClient.users.getUser(userId);
  // Only a verified primary email can link to a pre-provisioned account or invitation.
  const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified') return null;
  const ident = { subject: userId, email: primary.emailAddress.toLowerCase(), name: [u.firstName, u.lastName].filter(Boolean).join(' ') || null };
  clerkEmailCache.set(userId, ident);
  return ident;
}

// Finds the local user for a signed-in identity, linking by verified email on first sign-in.
// Creating a user record never grants admin rights or project access.
export async function resolveUser(ident: ExternalIdentity): Promise<CurrentUser> {
  const bySubject = await pool.query('SELECT id, email, display_name, is_admin FROM users WHERE auth_subject=$1', [ident.subject]);
  let row = bySubject.rows[0];
  if (!row) {
    const linked = await pool.query(
      `UPDATE users SET auth_subject=$1, display_name=COALESCE(display_name,$3)
       WHERE email=$2 AND auth_subject IS NULL RETURNING id, email, display_name, is_admin`,
      [ident.subject, ident.email, ident.name],
    );
    row = linked.rows[0];
  }
  if (!row) {
    const created = await pool.query(
      `INSERT INTO users(auth_subject, email, display_name) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING RETURNING id, email, display_name, is_admin`,
      [ident.subject, ident.email, ident.name],
    );
    row = created.rows[0];
    if (!row) throw new HttpError(409, 'identity_conflict', 'This email is linked to a different sign-in. Contact Rishari.');
  }
  return { id: row.id, email: row.email, displayName: row.display_name, isAdmin: row.is_admin };
}

export function authMiddleware() {
  const clerk = config.authMode === 'clerk' ? clerkMiddleware() : null;
  return [
    (req: Request, res: Response, next: NextFunction) => (clerk ? clerk(req, res, next) : next()),
    async (req: Request, _res: Response, next: NextFunction) => {
      try {
        const ident = await externalIdentity(req);
        if (ident) req.user = await resolveUser(ident);
        next();
      } catch (e) { next(e); }
    },
  ];
}

export function requireUser(req: Request): CurrentUser {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
  return req.user;
}
