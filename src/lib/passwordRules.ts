export function getStrongPasswordErrors(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 12) errors.push("Password must be at least 12 characters");
  if (password.length > 128) errors.push("Password must be at most 128 characters");
  if (!/[a-z]/.test(password)) errors.push("Password must contain a lowercase letter");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain a special character");
  return errors;
}

export function isLoginPasswordValid(password: string): boolean {
  return password.length >= 1 && password.length <= 128;
}
