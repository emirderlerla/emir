import React, { useState } from 'react';
import { Eye, EyeOff, Globe, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';

export function AuthPage() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const { lang, setLanguage, l } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await login(email, password);
      showToast(l('Komuta merkezine hoş geldiniz.', 'Welcome to the Command Center.'));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : l('Kimlik doğrulama başarısız.', 'Authentication failed.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/90 bg-[#101827] p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src="/src/assets/images/emir7_command_emblem_1795089628387.jpg"
              alt="Noah Command Center"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover border border-[#38BDF8]/30 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold tracking-tight text-white">
                Noah Command Center
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {l(
                  'Kişisel Yapay Zeka Proje ve Verimlilik Sistemi',
                  'Personal AI Project & Productivity System'
                )}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center p-0.5 rounded-lg bg-[#070B14] border border-slate-800 shrink-0">
            <Globe className="w-3.5 h-3.5 text-slate-400 mx-1.5" />
            <button
              type="button"
              onClick={() => setLanguage('tr', false)}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                lang === 'tr' ? 'bg-[#2563EB] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              TR
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en', false)}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                lang === 'en' ? 'bg-[#2563EB] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <div className="mb-5 pb-4 border-b border-slate-800/80">
          <h2 className="text-sm font-semibold text-white">{l('Giriş Yap', 'Sign In')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {l(
              'Kişisel çalışma alanınıza erişmek için hesap bilgilerinizi girin.',
              'Enter your account credentials to access your personal workspace.'
            )}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {l('E-posta Adresi', 'Email Address')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="noah@command.center"
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-[#070B14] border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38BDF8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {l('Şifre', 'Password')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={l('Şifrenizi girin', 'Enter your password')}
                className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl bg-[#070B14] border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38BDF8]"
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                aria-label={showPass ? l('Şifreyi gizle', 'Hide password') : l('Şifreyi göster', 'Show password')}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {submitting
              ? l('Giriş Yapılıyor...', 'Signing In...')
              : l('Komuta Merkezine Gir', 'Enter Command Center')}
          </button>
        </form>
      </div>
    </div>
  );
}
