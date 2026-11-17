import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

// API keys are encrypted at rest with a per-install key that never leaves this machine.
const keyPath = path.join(DATA_DIR, 'secret.key');

function loadKey(): Buffer {
  if (!existsSync(keyPath)) {
    writeFileSync(keyPath, randomBytes(32).toString('base64'));
    chmodSync(keyPath, 0o600);
  }
  return Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64');
}

const KEY = loadKey();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(enc: string): string {
  const [iv, tag, data] = enc.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
