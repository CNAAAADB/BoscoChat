import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const PARAMETERS = Object.freeze({ N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, PARAMETERS);
  return [
    'scrypt',
    PARAMETERS.N,
    PARAMETERS.r,
    PARAMETERS.p,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password, encodedHash) {
  try {
    const [algorithm, n, r, p, encodedSalt, encodedKey] = encodedHash.split('$');
    if (algorithm !== 'scrypt') return false;
    if (Number(n) !== PARAMETERS.N || Number(r) !== PARAMETERS.r || Number(p) !== PARAMETERS.p) return false;

    const expected = Buffer.from(encodedKey, 'base64url');
    if (expected.length !== KEY_LENGTH) return false;

    const actual = await scrypt(password, Buffer.from(encodedSalt, 'base64url'), KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMETERS.maxmem,
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
