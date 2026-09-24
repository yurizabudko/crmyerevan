import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalDiskStorage } from './file-storage.js';

const root = await mkdtemp(join(tmpdir(), 'crm-files-'));
const storage = new LocalDiskStorage(root);

afterAll(() => rm(root, { recursive: true, force: true }));

describe('LocalDiskStorage', () => {
  it('stores, reads and deletes files', async () => {
    await storage.put('listings/1/a.jpg', Buffer.from('photo'));
    expect((await storage.get('listings/1/a.jpg'))?.toString()).toBe('photo');
    await storage.delete('listings/1/a.jpg');
    expect(await storage.get('listings/1/a.jpg')).toBeNull();
  });

  it('refuses keys outside the root', async () => {
    await expect(storage.put('../escape.txt', Buffer.from('x'))).rejects.toThrow();
    await expect(storage.get('/etc/passwd')).rejects.toThrow();
  });
});
