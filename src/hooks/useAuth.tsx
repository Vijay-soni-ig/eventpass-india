import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, ApiError, getToken, setToken } from '@/lib/apiClient';
import type { RoleContext } from '@/lib/permissions';

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  href: string;
  required: boolean;
  completed: boolean;
}

export interface OnboardingSummary {
  required: boolean;
  role: 'organizer' | 'exhibitor' | null;
  completed: boolean;
  percent: number;
  nextStepKey: string | null;
  steps: OnboardingStep[];
}

export interface AppUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  userType: 'visitor' | 'exhibitor' | 'organizer';
  onboarding: OnboardingSummary;
  createdAt: string;
  roles: RoleContext;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, userType: 'visitor' | 'exhibitor' | 'organizer') => Promise<{ error: Error | null; user: AppUser | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; user: AppUser | null }>;
  signOut: () => Promise<void>;
  updateProfile: (input: { fullName: string; phone: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get<{ user: AppUser }>('/api/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signUp = async (email: string, password: string, fullName: string, userType: 'visitor' | 'exhibitor' | 'organizer') => {
    try {
      const { token, user } = await api.post<{ token: string; user: AppUser }>('/api/auth/signup', {
        email,
        password,
        fullName,
        userType,
      });
      setToken(token);
      setUser(user);
      return { error: null, user };
    } catch (err) {
      return { error: err instanceof ApiError ? new Error(err.message) : (err as Error), user: null };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { token, user } = await api.post<{ token: string; user: AppUser }>('/api/auth/login', {
        email,
        password,
      });
      setToken(token);
      setUser(user);
      return { error: null, user };
    } catch (err) {
      return { error: err instanceof ApiError ? new Error(err.message) : (err as Error), user: null };
    }
  };

  const signOut = async () => {
    try {
      if (getToken()) await api.post<void>('/api/auth/logout');
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  const updateProfile = async (input: { fullName: string; phone: string }) => {
    const { user } = await api.patch<{ user: AppUser }>('/api/auth/me', input);
    setUser(user);
  };

  // The server revokes every session on a password change and hands back a
  // fresh token for this device.
  const changePassword = async (currentPassword: string, newPassword: string) => {
    const { token } = await api.post<{ token: string }>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
    setToken(token);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
