import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, ChefHat, AlertCircle, Loader2, ShieldCheck, User } from 'lucide-react';
import { resendConfirmation, sendPasswordReset, signUp, signIn, updatePassword } from '../features/auth/authService';
import { APP_VERSION } from '../config/appVersion';
import { soundFx } from '../utils/audio';
import { SUPPORTED_LANGUAGES, translate } from '../utils/i18n';

export default function AuthScreen({ lang = 'en', setLang, enabledLanguages = SUPPORTED_LANGUAGES, passwordRecovery = false, onPasswordRecovered }) {
  const tr = (key) => translate(lang, key);
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (isForgotPassword) {
      if (!email.trim()) {
        setError(tr('emailRequired'));
        return;
      }
      setIsLoading(true);
      const { error: resetError } = await sendPasswordReset(email);
      setIsLoading(false);
      if (resetError) setError(resetError.message);
      else setNotice(tr('passwordResetSent'));
      return;
    }

    if (!passwordRecovery && (!email.trim() || !password.trim())) {
      setError(tr('loginRequired'));
      soundFx.playRemove();
      return;
    }

    if (!passwordRecovery && isSignUp && !fullName.trim()) {
      setError(tr('nameRequired'));
      soundFx.playRemove();
      return;
    }

    if (password.length < 8) {
      setError(tr('passwordLength'));
      soundFx.playRemove();
      return;
    }

    if ((isSignUp || passwordRecovery) && password !== confirmPassword) {
      setError(tr('passwordMismatch'));
      return;
    }

    setIsLoading(true);
    soundFx.playTap();

    try {
      if (passwordRecovery) {
        const { error: authError } = await updatePassword(password);
        if (authError) setError(authError.message);
        else {
          setNotice(tr('passwordUpdated'));
          window.history.replaceState({}, document.title, window.location.pathname);
          onPasswordRecovered?.();
        }
      } else if (isSignUp) {
        const { data, error: authError } = await signUp(
          email.trim(),
          password,
          fullName.trim()
        );

        if (authError) {
          setError(authError.message);
          soundFx.playRemove();
        } else {
          soundFx.playSuccess();
          if (!data?.session) {
            setNotice(tr('accountCreated'));
          }
        }
      } else {
        const { error: authError } = await signIn(email.trim(), password);

        if (authError) {
          setError(authError.message);
          soundFx.playRemove();
        } else {
          soundFx.playSuccess();
        }
      }
    } catch (err) {
      console.error('Authentication error:', err);
      setError(tr('unexpectedRetry'));
      soundFx.playRemove();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#0A0A0F]">
      {/* Animated Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
          style={{
            background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)',
            top: '-15%',
            right: '-10%',
            animation: 'floatOrb1 12s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-15 blur-[100px]"
          style={{
            background: 'radial-gradient(circle, #B8952B 0%, transparent 70%)',
            bottom: '-10%',
            left: '-5%',
            animation: 'floatOrb2 15s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[300px] h-[300px] rounded-full opacity-10 blur-[80px]"
          style={{
            background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)',
            top: '40%',
            left: '30%',
            animation: 'floatOrb3 10s ease-in-out infinite',
          }}
        />
      </div>

      {/* Subtle Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(212,175,55,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.3) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Auth Card */}
      <div className="relative z-10 w-full max-w-[440px] mx-auto px-4">
        {/* Card Container with Glass Effect */}
        <div
          className="rounded-[28px] border border-white/[0.08] p-8 sm:p-10 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(26,26,30,0.95) 0%, rgba(18,18,22,0.98) 100%)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.05), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}
        >
          {/* Top Gold Accent Line */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-24 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
            }}
          />

          <div className="absolute right-5 top-4 flex rounded-lg border border-white/10 bg-black/20 p-0.5">
            {SUPPORTED_LANGUAGES.filter((code) => enabledLanguages.includes(code)).map((code) => (
              <button key={code} type="button" onClick={() => setLang?.(code)} className={`rounded-md px-2 py-1 text-[9px] font-black uppercase ${lang === code ? 'bg-[#D4AF37] text-black' : 'text-gray-400'}`}>
                {code}
              </button>
            ))}
          </div>

          {/* Header: Logo & Branding */}
          <div className="flex flex-col items-center mb-6">
            {/* Animated Logo Ring */}
            <div
              className="w-[88px] h-[88px] rounded-full p-[3px] mb-4 relative"
              style={{
                background: 'conic-gradient(from 0deg, #D4AF37, #B8952B, #8B6914, #D4AF37)',
                animation: 'spinGlow 6s linear infinite',
              }}
            >
              <div className="w-full h-full rounded-full bg-[#121216] flex flex-col items-center justify-center">
                <ChefHat className="w-8 h-8 text-[#D4AF37] mb-0.5" />
                <span className="text-[7px] tracking-[3px] text-[#D4AF37] font-bold uppercase">POS</span>
              </div>
              {/* Outer glow pulse */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  boxShadow: '0 0 30px rgba(212,175,55,0.15)',
                  animation: 'pulseGlow 3s ease-in-out infinite',
                }}
              />
            </div>

            <h1 className="text-[20px] font-bold text-white tracking-tight">
              {passwordRecovery ? tr('resetPasswordTitle') : isForgotPassword ? tr('forgotPasswordTitle') : isSignUp ? tr('signupTitle') : tr('loginTitle')}
            </h1>
            <p className="text-gray-500 text-xs mt-1.5 font-medium">
              {passwordRecovery ? tr('resetPasswordSubtitle') : isForgotPassword ? tr('forgotPasswordSubtitle') : isSignUp ? tr('signupSubtitle') : tr('loginSubtitle')}
            </p>
          </div>

          {/* Tab Selection */}
          {!passwordRecovery && !isForgotPassword && <div className="flex border-b border-white/[0.08] mb-6">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setError('');
                soundFx.playTap();
              }}
              className={`flex-1 pb-3 text-[13px] font-bold tracking-wider transition-colors relative cursor-pointer text-center ${
                !isSignUp ? 'text-[#D4AF37]' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tr('signIn')}
              {!isSignUp && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#D4AF37]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setError('');
                soundFx.playTap();
              }}
              className={`flex-1 pb-3 text-[13px] font-bold tracking-wider transition-colors relative cursor-pointer text-center ${
                isSignUp ? 'text-[#D4AF37]' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tr('registerTab')}
              {isSignUp && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#D4AF37]" />
              )}
            </button>
          </div>}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name Field (Sign Up Only) */}
            {isSignUp && !passwordRecovery && !isForgotPassword && (
              <div className="relative group">
                <div
                  className={`flex items-center gap-3 rounded-2xl border px-4 h-[52px] transition-all duration-300 ${
                    focusedField === 'fullName'
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/[0.04] shadow-[0_0_20px_rgba(212,175,55,0.08)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                  }`}
                >
                  <User
                    className={`w-[18px] h-[18px] transition-colors duration-300 shrink-0 ${
                      focusedField === 'fullName' ? 'text-[#D4AF37]' : 'text-gray-500'
                    }`}
                  />
                  <input
                    type="text"
                    id="new-name"
                    name="name"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setError(''); }}
                    onFocus={() => setFocusedField('fullName')}
                    onBlur={() => setFocusedField(null)}
                    placeholder={tr('fullName')}
                    autoComplete="name"
                    required={isSignUp}
                    className="flex-1 bg-transparent text-white text-[14px] font-medium placeholder:text-gray-600 outline-none caret-[#D4AF37]"
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            {!passwordRecovery && <div className="relative group">
              <div
                className={`flex items-center gap-3 rounded-2xl border px-4 h-[52px] transition-all duration-300 ${
                  focusedField === 'email'
                    ? 'border-[#D4AF37]/60 bg-[#D4AF37]/[0.04] shadow-[0_0_20px_rgba(212,175,55,0.08)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                }`}
              >
                <Mail
                  className={`w-[18px] h-[18px] transition-colors duration-300 shrink-0 ${
                    focusedField === 'email' ? 'text-[#D4AF37]' : 'text-gray-500'
                  }`}
                />
                <input
                  type="email"
                  id={isSignUp ? "new-email" : "current-email"}
                  name="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder={tr('email')}
                  autoComplete="username"
                  required
                  className="flex-1 bg-transparent text-white text-[14px] font-medium placeholder:text-gray-600 outline-none caret-[#D4AF37]"
                />
              </div>
            </div>}

            {/* Password Field */}
            {!isForgotPassword && <div className="relative group">
              <div
                className={`flex items-center gap-3 rounded-2xl border px-4 h-[52px] transition-all duration-300 ${
                  focusedField === 'password'
                    ? 'border-[#D4AF37]/60 bg-[#D4AF37]/[0.04] shadow-[0_0_20px_rgba(212,175,55,0.08)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                }`}
              >
                <Lock
                  className={`w-[18px] h-[18px] transition-colors duration-300 shrink-0 ${
                    focusedField === 'password' ? 'text-[#D4AF37]' : 'text-gray-500'
                  }`}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id={isSignUp ? "new-password" : "current-password"}
                  name="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder={tr('password')}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  className="flex-1 bg-transparent text-white text-[14px] font-medium placeholder:text-gray-600 outline-none caret-[#D4AF37]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-gray-500 hover:text-gray-300 transition-colors p-1 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="w-[18px] h-[18px]" />
                    : <Eye className="w-[18px] h-[18px]" />
                  }
                </button>
              </div>
            </div>}

            {(isSignUp || passwordRecovery) && !isForgotPassword && (
              <div className="relative group">
                <div className="flex h-[52px] items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4">
                  <Lock className="h-[18px] w-[18px] shrink-0 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => { setConfirmPassword(event.target.value); setError(''); }}
                    placeholder={tr('confirmPassword')}
                    autoComplete="new-password"
                    required
                    className="flex-1 bg-transparent text-[14px] font-medium text-white outline-none placeholder:text-gray-600"
                  />
                </div>
              </div>
            )}

            {/* Alert Message */}
            {error && (
              <div
                className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-[13px] leading-relaxed font-medium ${
                  error === tr('accountCreated')
                    ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
                    : 'border-red-500/20 bg-red-500/[0.06] text-red-400'
                }`}
                style={{ animation: error === tr('accountCreated') ? 'none' : 'shakeError 0.4s ease-in-out' }}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5 text-[13px] font-medium leading-relaxed text-emerald-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full h-[52px] rounded-2xl font-bold text-[14px] tracking-wide transition-all duration-300 flex items-center justify-center gap-2.5 cursor-pointer ${
                isLoading
                  ? 'bg-[#D4AF37]/40 text-black/60 cursor-wait'
                  : 'bg-gradient-to-r from-[#D4AF37] to-[#C59B27] text-black hover:shadow-[0_12px_32px_rgba(212,175,55,0.35)] active:scale-[0.98] shadow-[0_8px_20px_rgba(212,175,55,0.2)]'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{isForgotPassword ? tr('sending') : passwordRecovery ? tr('saving') : isSignUp ? tr('creatingAccount') : tr('signingIn')}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>{isForgotPassword ? tr('sendResetLink') : passwordRecovery ? tr('updatePassword') : isSignUp ? tr('register') : tr('signIn')}</span>
                </>
              )}
            </button>

            {!passwordRecovery && !isSignUp && (
              <button type="button" onClick={() => { setIsForgotPassword(!isForgotPassword); setError(''); setNotice(''); }} className="w-full text-xs font-semibold text-[#D4AF37] hover:text-[#E7C75A]">
                {isForgotPassword ? tr('backToSignIn') : tr('forgotPassword')}
              </button>
            )}

            {!passwordRecovery && isSignUp && (
              <button type="button" onClick={async () => {
                setError(''); setNotice('');
                const { error: resendError } = await resendConfirmation(email);
                if (resendError) setError(resendError.message); else setNotice(tr('confirmationResent'));
              }} className="w-full text-xs font-semibold text-gray-400 hover:text-[#D4AF37]">
                {tr('resendConfirmation')}
              </button>
            )}
          </form>

          {/* Footer Secured Badge */}
          <div className="flex items-center justify-center gap-2 mt-6 text-gray-600 text-[10px] font-medium">
            <Lock className="w-3 h-3" />
            <span>{tr('securedAuth')}</span>
          </div>
        </div>

        {/* Bottom Version Tag */}
        <p className="text-center mt-5 text-gray-700 text-[11px] font-medium tracking-wide">
          {tr('fineDiningTerminal')} · {APP_VERSION}
        </p>
      </div>

      {/* Keyframe Animations */}
      <style>{`
        @keyframes floatOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-40px, 30px) scale(1.1); }
          66% { transform: translate(20px, -20px) scale(0.95); }
        }
        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -40px) scale(1.05); }
        }
        @keyframes floatOrb3 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-20px, 20px); }
        }
        @keyframes spinGlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes shakeError {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px); }
          30% { transform: translateX(5px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(3px); }
          75% { transform: translateX(-2px); }
        }
      `}</style>
    </div>
  );
}
