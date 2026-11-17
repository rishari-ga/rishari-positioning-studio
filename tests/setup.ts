process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/rishari_test';
process.env.AUTH_MODE = 'dev';
process.env.NODE_ENV = 'test';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = './.data/test-uploads';
process.env.APP_URL = 'http://localhost:3000';
