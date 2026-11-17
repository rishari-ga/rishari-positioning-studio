import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';

// All file access goes through this interface so the backing store can change without touching business logic.
export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageAdapter {
  constructor(private root: string) {}
  private file(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error('invalid storage key');
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.file(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body, { mode: 0o600 });
  }
  async get(key: string) { return fs.readFile(this.file(key)); }
  async remove(key: string) { await fs.rm(this.file(key), { force: true }); }
}

class S3Storage implements StorageAdapter {
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      region: config.storage.s3Region,
      endpoint: config.storage.s3Endpoint || undefined,
      credentials: { accessKeyId: config.storage.s3AccessKeyId, secretAccessKey: config.storage.s3SecretAccessKey },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async remove(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
}

export const storage: StorageAdapter = config.storage.driver === 's3'
  ? new S3Storage(config.storage.s3Bucket)
  : new LocalStorage(config.storage.localDir);
