import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export async function hashLocalPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await deriveKey(password, salt, KEY_LENGTH);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt}$${derived.toString("base64url")}`;
}

export async function verifyLocalPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelization, salt, expected] = storedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    Number(cost) !== COST ||
    Number(blockSize) !== BLOCK_SIZE ||
    Number(parallelization) !== PARALLELIZATION ||
    !salt ||
    !expected
  ) return false;

  const expectedBuffer = Buffer.from(expected, "base64url");
  const derivedBuffer = await deriveKey(password, salt, expectedBuffer.length);
  return expectedBuffer.length === derivedBuffer.length && timingSafeEqual(expectedBuffer, derivedBuffer);
}

function deriveKey(password: string, salt: string, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    }, (error, derived) => error ? reject(error) : resolve(derived));
  });
}
