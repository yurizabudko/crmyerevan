import { hash, verify } from '@node-rs/argon2';

/** Хеширование паролей argon2id (НФТ-6). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
