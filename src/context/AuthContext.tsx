import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api';
import type { UserProfile, UserSettings } from '../types';

interface AuthContextValue {
  user: UserProfile | null;
  settings: UserSettings | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateSettingsLocal: (next: UserSettings) => void;
  updateUserLocal: (next: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applyThemeToDocument(theme: 'dark' | 'slate' | 'light' | undefined) {
  const root = document.documentElement;
  const body = document.body;
  if (theme === 'light') {
    root.classList.remove('dark');
    body.className = 'bg-slate-50 text-slate-900 antialiased selection:bg-[#38BDF8]/30';
  } else if (theme === 'slate') {
    root.classList.add('dark');
    body.className = 'bg-[#0B1120] text-slate-100 antialiased selection:bg-[#38BDF8]/30 selection:text-white';
  } else {
    root.classList.add('dark');
    body.className = 'bg-[#070B14] text-slate-100 antialiased selection:bg-[#38BDF8]/30 selection:text-white';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      if (!getStoredToken()) {
        try {
          const data = await apiRequest<{ user: UserProfile; settings: UserSettings }>('/api/auth/me');
          setUser(data.user);
          setSettings(data.settings);
          applyThemeToDocument(data.settings.theme);
          return;
        } catch {
          setUser(null);
          setSettings(null);
          applyThemeToDocument('dark');
          return;
        }
      }

      const data = await apiRequest<{ user: UserProfile; settings: UserSettings }>('/api/auth/me');
      setUser(data.user);
      setSettings(data.settings);
      applyThemeToDocument(data.settings.theme);
    } catch {
      setUser(null);
      setSettings(null);
      setStoredToken(null);
      applyThemeToDocument('dark');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setStoredToken(null);
      setUser(null);
      setSettings(null);
      applyThemeToDocument('dark');
    };
    window.addEventListener('noah:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('noah:unauthorized', handleUnauthorized);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiRequest<{ user: UserProfile; settings: UserSettings; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(data.token);
    setUser(data.user);
    setSettings(data.settings);
    applyThemeToDocument(data.settings.theme);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
      setUser(null);
      setSettings(null);
      applyThemeToDocument('dark');
    }
  };

  const updateSettingsLocal = (next: UserSettings) => {
    setSettings(next);
    applyThemeToDocument(next.theme);
  };

  const updateUserLocal = (next: UserProfile) => {
    setUser(next);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        loading,
        login,
        logout,
        refreshSession,
        updateSettingsLocal,
        updateUserLocal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
