import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!secret) throw new Error('School Pay encryption key is unavailable.');
  return createHmac('sha256', secret).update('school-pay:parent-pin:v1').digest();
}

function familyContext(schoolId: string, phone: string): Buffer {
  return Buffer.from(JSON.stringify([schoolId, phone]));
}

export function encryptParentPin(pin: string, schoolId: string, phone: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(familyContext(schoolId, phone));
  const encrypted = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptParentPin(sealed: string, schoolId: string, phone: string): string | null {
  const parts = sealed.split('.');
  if (parts.length !== 3) return null;
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16 || encrypted.length !== 6) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: 16 });
    decipher.setAAD(familyContext(schoolId, phone));
    decipher.setAuthTag(tag);
    const pin = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return /^\d{6}$/.test(pin) ? pin : null;
  } catch {
    return null;
  }
}
