import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";

type PasswordComparator = (password: string, hash: string) => Promise<boolean>;

// Existing repository accounts use bcrypt cost 10 (seeded/legacy) or cost 12
// (current signup). Generate both dummy hashes once per process so an
// unknown-account attempt performs the same pair of costed comparisons as
// either supported stored-hash cost, without hashing on every request.
const DUMMY_PASSWORD_HASHES = {
  10: bcrypt.hashSync(randomBytes(32).toString("hex"), 10),
  12: bcrypt.hashSync(randomBytes(32).toString("hex"), 12),
} as const;

function getSupportedBcryptCost(hash: string): 10 | 12 | undefined {
  const match = /^\$2[aby]\$(10|12)\$/.exec(hash);
  if (!match) return undefined;
  return Number(match[1]) as 10 | 12;
}

export async function compareLoginPassword(
  password: string,
  passwordHash: string | null | undefined,
  compare: PasswordComparator = (value, hash) => bcrypt.compare(value, hash),
): Promise<boolean> {
  const storedHash = typeof passwordHash === "string" && passwordHash.length > 0
    ? passwordHash
    : undefined;
  const cost = storedHash ? getSupportedBcryptCost(storedHash) : undefined;

  // For cost-10 and cost-12 accounts, compare the real hash plus a dummy hash
  // at the complementary cost. Unknown accounts compare against both dummies.
  // This keeps the bcrypt work profile consistent for all supported accounts.
  const hashesToCompare = !storedHash
    ? [DUMMY_PASSWORD_HASHES[10], DUMMY_PASSWORD_HASHES[12]]
    : cost === 10
      ? [storedHash, DUMMY_PASSWORD_HASHES[12]]
      : cost === 12
        ? [storedHash, DUMMY_PASSWORD_HASHES[10]]
        : [storedHash, DUMMY_PASSWORD_HASHES[10], DUMMY_PASSWORD_HASHES[12]];

  const results = await Promise.all(hashesToCompare.map((hash) => compare(password, hash)));
  return storedHash !== undefined && results[0];
}
