import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";

type PasswordComparator = (password: string, hash: string) => Promise<boolean>;

// Generate one cost-12 dummy hash per process. Unknown-account login attempts
// perform the same bcrypt comparison as known-account attempts without
// generating a new hash on every request.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);

export async function compareLoginPassword(
  password: string,
  passwordHash: string | null | undefined,
  compare: PasswordComparator = (value, hash) => bcrypt.compare(value, hash),
): Promise<boolean> {
  const storedHash = typeof passwordHash === "string" && passwordHash.length > 0
    ? passwordHash
    : undefined;
  const matches = await compare(password, storedHash ?? DUMMY_PASSWORD_HASH);
  return storedHash !== undefined && matches;
}
