import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from './config.js';
import { h, errorHandler, HttpError } from './http.js';
import { authMiddleware, requireUser } from './auth/identity.js';
import { requireAdmin, requireProjectAccess, requireClientMember, assertUuid } from './services/permissions.js';
import * as projects from './services/projects.js';
import * as intake from './services/intake.js';
import * as files from './services/attachments.js';
import * as admin from './services/admin.js';
import * as narrative from './services/narrative.js';
import { pool } from './db/pool.js';

// Simple fixed-window rate limiter keyed by user or IP.
function rateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.user?.id ?? req.ip ?? 'anon';
    const now = Date.now();
    const e = hits.get(key);
    if (!e || e.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return next(); }
    if (++e.n > limit) return res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please wait a moment.' });
    next();
  };
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use(authMiddleware());
  app.use('/api', rateLimit(300, 60_000));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploads.maxBytes, files: 1 } });

  // ---- Public and session --------------------------------------------------
  app.get('/api/config', (_req, res) => res.json({ authMode: config.authMode, clerkPublishableKey: config.clerkPublishableKey }));

  app.get('/api/me', h(async (req, res) => {
    if (!req.user) return res.json({ user: null });
    const list = req.user.isAdmin ? [] : await projects.listProjectsForClient(req.user);
    res.json({ user: req.user, projects: list });
  }));

  app.get('/api/data-use', h(async (_req, res) => { res.json(await admin.getDataUse()); }));

  if (config.authMode === 'dev') {
    // Local testing only. config.ts refuses to start with AUTH_MODE=dev in production.
    app.post('/api/dev/login', (req, res) => {
      const email = z.string().email().parse(req.body?.email).toLowerCase();
      res.cookie('dev_user', email, { httpOnly: true, sameSite: 'lax' });
      res.json({ ok: true });
    });
    app.post('/api/dev/logout', (_req, res) => { res.clearCookie('dev_user'); res.json({ ok: true }); });
  }

  app.post('/api/invitations/accept', h(async (req, res) => {
    const user = requireUser(req);
    const token = z.string().min(10).max(200).parse(req.body?.token);
    res.json(await projects.acceptInvitation(user, token));
  }));

  // ---- Client project routes -----------------------------------------------
  const pr = express.Router({ mergeParams: true });
  app.use('/api/projects/:pid', pr);

  pr.get('/discovery', h(async (req, res) => {
    const user = requireUser(req);
    const a = await requireProjectAccess(user, req.params.pid);
    res.json(await intake.getDiscoveryState(a.projectId, a.asAdmin ? null : user.id));
  }));

  pr.post('/acknowledgment', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    await intake.recordAcknowledgment(user, req.params.pid, z.string().parse(req.body?.version));
    res.json({ ok: true });
  }));

  pr.put('/answers/:questionKey', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    const offerId = typeof req.query.offerId === 'string' && req.query.offerId ? req.query.offerId : null;
    if (offerId) assertUuid(offerId);
    res.json(await intake.saveAnswer(user, req.params.pid, req.params.questionKey, offerId, intake.saveAnswerInput.parse(req.body)));
  }));

  pr.post('/stakeholders', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    res.json(await intake.upsertStakeholder(user, req.params.pid, null, intake.stakeholderInput.parse(req.body)));
  }));
  pr.put('/stakeholders/:sid', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    assertUuid(req.params.sid);
    res.json(await intake.upsertStakeholder(user, req.params.pid, req.params.sid, intake.stakeholderInput.parse(req.body)));
  }));
  pr.delete('/stakeholders/:sid', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    assertUuid(req.params.sid);
    await intake.deleteStakeholder(user, req.params.pid, req.params.sid);
    res.json({ ok: true });
  }));

  pr.post('/offers', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    res.json(await intake.upsertOffer(user, req.params.pid, null, intake.offerInput.parse(req.body)));
  }));
  pr.put('/offers/:oid', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    assertUuid(req.params.oid);
    res.json(await intake.upsertOffer(user, req.params.pid, req.params.oid, intake.offerInput.parse(req.body)));
  }));
  pr.delete('/offers/:oid', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    assertUuid(req.params.oid);
    await intake.deleteOffer(user, req.params.pid, req.params.oid);
    res.json({ ok: true });
  }));

  pr.put('/modules/:moduleKey/progress', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    const body = z.object({ markedForDiscussion: z.boolean().optional(), clientCorrection: z.string().max(20000).nullable().optional() }).parse(req.body);
    await intake.setModuleProgress(user, req.params.pid, req.params.moduleKey, body);
    res.json({ ok: true });
  }));

  pr.post('/attachments', rateLimit(20, 60_000), h(async (req, res, next) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    await new Promise<void>((resolve, reject) => upload.single('file')(req, res, (e) => (e ? reject(e) : resolve())));
    if (!req.file) throw new HttpError(400, 'no_file', 'Choose a file to upload.');
    const moduleKey = typeof req.body?.moduleKey === 'string' ? req.body.moduleKey : null;
    res.json(await files.uploadAttachment(user, req.params.pid, req.file, moduleKey));
    void next;
  }));
  pr.delete('/attachments/:aid', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    assertUuid(req.params.aid);
    await files.deleteAttachment(user, req.params.pid, req.params.aid);
    res.json({ ok: true });
  }));
  pr.get('/attachments/:aid/link', h(async (req, res) => {
    const user = requireUser(req);
    await requireProjectAccess(user, req.params.pid);
    assertUuid(req.params.aid);
    res.json(await files.createDownloadLink(user, req.params.pid, req.params.aid));
  }));

  pr.post('/submit', h(async (req, res) => {
    const user = requireUser(req);
    await requireClientMember(user, req.params.pid);
    const body = z.object({ confirmed: z.literal(true), idempotencyKey: z.string().min(8).max(100) }).parse(req.body);
    res.json(await intake.submitIntake(user, req.params.pid, body));
  }));

  app.get('/api/files/:aid', h(async (req, res) => {
    const user = requireUser(req);
    assertUuid(req.params.aid);
    const { meta, body } = await files.readSignedDownload(user, req.params.aid, req.query as Record<string, string>);
    // Re-check project access at download time, not only when the link was issued.
    await requireProjectAccess(user, meta.project_id);
    res.setHeader('Content-Type', meta.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${meta.original_name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }));

  // ---- Admin routes ----------------------------------------------------------
  const ad = express.Router();
  app.use('/api/admin', ad);
  ad.use((req, _res, next) => { try { requireAdmin(requireUser(req)); next(); } catch (e) { next(e); } });

  ad.get('/projects', h(async (req, res) => { res.json(await projects.listProjectsForAdmin(req.user!)); }));
  ad.post('/projects', h(async (req, res) => {
    const body = z.object({ name: z.string().trim().min(1).max(200), companyName: z.string().trim().max(200).optional(), isFictional: z.boolean().optional() }).parse(req.body);
    res.json(await projects.createProject(req.user!, body));
  }));

  const ap = express.Router({ mergeParams: true });
  ad.use('/projects/:pid', ap);
  ap.use(h(async (req, _res, next) => { await requireProjectAccess(req.user!, req.params.pid); next(); }));

  ap.get('/', h(async (req, res) => { res.json(await projects.getProjectOverview(req.params.pid)); }));
  ap.post('/invitations', h(async (req, res) => {
    const email = z.string().trim().email().parse(req.body?.email);
    const inv = await projects.createInvitation(req.user!, req.params.pid, email);
    res.json({ ...inv, link: `${config.appUrl}/invite/${inv.token}` });
  }));
  ap.get('/answers', h(async (req, res) => { res.json(await intake.getDiscoveryState(req.params.pid, null)); }));
  ap.get('/answers/:qid/history', h(async (req, res) => {
    assertUuid(req.params.qid);
    res.json(await admin.answerHistory(req.user!, req.params.pid, req.params.qid));
  }));
  ap.get('/notes', h(async (req, res) => { res.json(await admin.listNotes(req.user!, req.params.pid)); }));
  ap.post('/notes', h(async (req, res) => { res.json(await admin.addNote(req.user!, req.params.pid, admin.noteInput.parse(req.body))); }));
  ap.patch('/notes/:nid', h(async (req, res) => {
    assertUuid(req.params.nid);
    res.json(await admin.updateNote(req.user!, req.params.pid, req.params.nid, req.body ?? {}));
  }));
  ap.get('/offers', h(async (req, res) => { res.json(await admin.adminOffers(req.user!, req.params.pid)); }));
  ap.put('/offers/:oid/scope', h(async (req, res) => {
    assertUuid(req.params.oid);
    res.json(await admin.setOfferScope(req.user!, req.params.pid, req.params.oid, z.boolean().parse(req.body?.inScope)));
  }));
  ap.get('/snapshots/:version', h(async (req, res) => {
    res.json(await admin.getSnapshot(req.user!, req.params.pid, z.coerce.number().int().positive().parse(req.params.version)));
  }));
  ap.get('/activity', h(async (req, res) => { res.json(await admin.activity(req.user!, req.params.pid)); }));
  ap.get('/narrative', h(async (req, res) => {
    res.json({ coverage: await narrative.coverageReport(req.params.pid), clarifications: await narrative.listClarifications(req.user!, req.params.pid) });
  }));
  ap.put('/coverage', h(async (req, res) => { await narrative.setCoverageOverride(req.user!, req.params.pid, narrative.overrideInput.parse(req.body)); res.json({ ok: true }); }));
  ap.post('/clarifications', h(async (req, res) => { res.json(await narrative.requestClarification(req.user!, req.params.pid, narrative.clarificationInput.parse(req.body))); }));
  ap.post('/clarifications/:cid/withdraw', h(async (req, res) => {
    assertUuid(req.params.cid);
    const r = await pool.query(`UPDATE clarification_requests SET status='withdrawn' WHERE id=$1 AND project_id=$2 AND status='open' RETURNING id`, [req.params.cid, req.params.pid]);
    if (!r.rows[0]) throw new HttpError(404, 'not_found', 'Not found');
    res.json({ ok: true });
  }));
  ap.post('/checks', h(async (req, res) => { res.json(await narrative.runProjectChecks(req.user!, req.params.pid)); }));
  ap.get('/flags', h(async (req, res) => { res.json(await narrative.listFlags(req.user!, req.params.pid)); }));
  ap.patch('/flags/:fid', h(async (req, res) => {
    assertUuid(req.params.fid);
    res.json(await narrative.decideFlag(req.user!, req.params.pid, req.params.fid, narrative.flagDecisionInput.parse(req.body)));
  }));
  ap.get('/source-approval', h(async (req, res) => { res.json(await narrative.getSourceApproval(req.user!, req.params.pid)); }));
  ap.post('/source-approval', h(async (req, res) => { res.json(await narrative.approveSource(req.user!, req.params.pid, narrative.approveSourceInput.parse(req.body))); }));

  ad.get('/guidance', h(async (req, res) => { res.json(await narrative.listGuidance(req.user!)); }));
  ad.put('/guidance/:key', h(async (req, res) => { await narrative.updateGuidance(req.user!, req.params.key, narrative.guidanceInput.parse(req.body)); res.json({ ok: true }); }));
  ad.get('/data-use', h(async (_req, res) => { res.json(await admin.getDataUse()); }));
  ad.put('/data-use', h(async (req, res) => { await admin.saveDataUse(req.user!, req.body); res.json({ ok: true }); }));

  app.get('/api/health', h(async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // ---- Static client ---------------------------------------------------------
  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/client');
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
