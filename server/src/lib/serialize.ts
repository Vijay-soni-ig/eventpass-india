import type { User } from "@prisma/client";

export function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    userType: user.userType,
    createdAt: user.createdAt,
  };
}
