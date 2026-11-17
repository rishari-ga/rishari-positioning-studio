import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const authMode = (process.env.AUTH_MODE ?? 'clerk') as 'clerk' | 'dev';

if (authMode === 'dev' && nodeEnv === 'production') {
  // Dev sign-in lets anyone pick an identity. It must never run in production.
  throw new Error('AUTH_MODE=dev is not allowed when NODE_ENV=production');
}

export const config = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: req('DATABASE_URL'),
  authMode,
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? '',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  // Secret used to sign short-lived download links. Required in production.
  downloadSecret: nodeEnv === 'production' ? req('DOWNLOAD_SIGNING_SECRET') : (process.env.DOWNLOAD_SIGNING_SECRET ?? 'dev-only-secret'),
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
    localDir: process.env.STORAGE_LOCAL_DIR ?? './.data/uploads',
    s3Bucket: process.env.S3_BUCKET ?? '',
    s3Region: process.env.S3_REGION ?? 'auto',
    s3Endpoint: process.env.S3_ENDPOINT ?? '',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
  uploads: {
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024),
  },
  ai: {
    // Runtime AI is wired up in Pass 2. Kept here so the setting exists from day one.
    enabled: process.env.AI_ENABLED === 'true',
    intakeModel: process.env.INTAKE_MODEL ?? 'gpt-5.4-mini',
    strategyModel: process.env.STRATEGY_MODEL ?? 'gpt-5.4',
  },
};

// In production, local storage is allowed only on a persistent disk (for example a Render disk),
// and only at an absolute path. Otherwise uploads would vanish on every deploy.
if (config.isProd && config.storage.driver === 'local' && !(process.env.STORAGE_PERSISTENT_DISK === 'true' && config.storage.localDir.startsWith('/'))) {
  throw new Error('In production, use S3-compatible storage, or set STORAGE_PERSISTENT_DISK=true with STORAGE_LOCAL_DIR on a mounted persistent disk.');
}
