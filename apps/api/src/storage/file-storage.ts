import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Хранилище файлов. Для MVP на одном сервере — локальный диск (Docker-том с бэкапом);
 * при переезде на S3 достаточно новой реализации этого интерфейса.
 */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  /** Ключи формирует приложение, но выход за пределы каталога всё равно запрещён. */
  private path(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Недопустимый ключ файла: ${key}`);
    return path;
  }
}
