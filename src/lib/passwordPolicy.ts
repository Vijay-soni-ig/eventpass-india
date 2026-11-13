import { z } from "zod";

// Match server/src/routes/auth.ts. Login accepts existing credentials without
// reapplying the current password-creation policy; signup uses the strong policy.
export const loginPasswordSchema = z.string().min(1, "Password is required").max(128, "Password must be at most 128 characters");

export const strongPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");
