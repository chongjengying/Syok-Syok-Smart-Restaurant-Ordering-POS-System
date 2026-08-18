import React, { useState, useEffect } from 'react';
import { X, User, Phone, Shield, LogOut, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getProfile, updateProfile } from '../features/auth/authService';
import { soundFx } from '../utils/audio';

export default function ProfileModal({ isOpen, onClose, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadProfileData();
    } else {
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [isOpen]);

  const loadProfileData = async () => {
    setIsFetching(true);
    setErrorMsg('');
    try {
      const { data, error } = await getProfile();
      if (error) {
        console.error('Error fetching profile:', error);
        setErrorMsg('Failed to load profile details.');
        soundFx.playRemove();
      } else if (data) {
        setProfile(data);
        setName(data.name || '');
        setUsername(data.username || '');
        setPhone(data.phone || '');
      }
    } catch (err) {
      console.error('Unexpected error loading profile:', err);
      setErrorMsg('An unexpected error occurred while loading profile.');
      soundFx.playRemove();
    } finally {
      setIsFetching(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Full Name is required.');
      soundFx.playRemove();
      return;
    }

    if (!username.trim()) {
      setErrorMsg('Username is required.');
      soundFx.playRemove();
      return;
    }

    setIsSaving(true);
    soundFx.playTap();

    try {
      const { data, error } = await updateProfile({
        name: name.trim(),
        username: username.trim(),
        phone: phone.trim()
      });

      if (error) {
        setErrorMsg(error.message);
        soundFx.playRemove();
      } else {
        setSuccessMsg('Profile updated successfully!');
        soundFx.playSuccess();
        if (data) {
          setProfile(prev => ({ ...prev, ...data }));
        }
      }
    } catch (err) {
      console.error('Unexpected error saving profile:', err);
      setErrorMsg('An unexpected error occurred while updating profile.');
      soundFx.playRemove();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const getInitials = (fullName) => {
    if (!fullName) return 'OP';
    return fullName
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      {/* Modal Dialog Box */}
      <div
        className="relative w-full max-w-[480px] rounded-[28px] border border-white/[0.08] p-8 overflow-hidden select-none"
        style={{
          background: 'linear-gradient(135deg, rgba(26,26,30,0.98) 0%, rgba(18,18,22,0.99) 100%)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.06), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {/* Top Gold Accent Line */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-24 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
          }}
        />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors cursor-pointer p-1.5 rounded-full hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>

        {isFetching ? (
          /* Loading State Skeleton */
          <div className="flex flex-col items-center py-10 space-y-6">
            <div className="w-[88px] h-[88px] rounded-full bg-white/5 animate-pulse flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
            </div>
            
            <div className="space-y-2 w-full flex flex-col items-center">
              <div className="h-6 w-32 bg-white/5 rounded animate-pulse" />
              <div className="h-4 w-20 bg-white/5 rounded-full animate-pulse" />
            </div>

            <div className="space-y-4 w-full pt-4">
              <div className="h-12 w-full bg-white/5 rounded-2xl animate-pulse" />
              <div className="h-12 w-full bg-white/5 rounded-2xl animate-pulse" />
              <div className="h-12 w-full bg-white/5 rounded-2xl animate-pulse" />
            </div>
          </div>
        ) : (
          /* Profile Edit Content */
          <>
            {/* User Metadata Header */}
            <div className="flex flex-col items-center mb-6">
              {/* Initials Avatar */}
              <div
                className="w-[84px] h-[84px] rounded-full p-[3px] mb-3 relative"
                style={{
                  background: 'conic-gradient(from 0deg, #D4AF37, #B8952B, #8B6914, #D4AF37)',
                }}
              >
                <div className="w-full h-full rounded-full bg-[#121216] flex items-center justify-center">
                  <span className="text-[24px] font-bold text-[#D4AF37] tracking-tight">
                    {getInitials(profile?.name)}
                  </span>
                </div>
              </div>

              {/* Role Badge */}
              <div className="flex items-center gap-1 bg-[#D4AF37]/[0.06] border border-[#D4AF37]/20 px-2.5 py-0.5 rounded-full mb-1">
                <Shield className="w-3 h-3 text-[#D4AF37]" />
                <span className="text-[9px] font-bold tracking-[1.5px] text-[#D4AF37] uppercase">
                  {profile?.role}
                </span>
              </div>

              <span className="text-gray-500 text-xs mt-1.5 font-medium select-text">
                {profile?.email}
              </span>
            </div>

            {/* Success & Error Messages */}
            {successMsg && (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 text-[13px] font-medium mb-4 animate-slideDown">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] text-red-400 text-[13px] leading-relaxed font-medium mb-4 animate-shake">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Profile Edit Form */}
            <form onSubmit={handleSave} className="space-y-4">
              {/* Full Name */}
              <div className="relative group">
                <div
                  className={`flex items-center gap-3 rounded-2xl border px-4 h-[50px] transition-all duration-300 ${
                    focusedField === 'name'
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/[0.04] shadow-[0_0_20px_rgba(212,175,55,0.08)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                  }`}
                >
                  <User className={`w-[16px] h-[16px] transition-colors shrink-0 ${focusedField === 'name' ? 'text-[#D4AF37]' : 'text-gray-500'}`} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setSuccessMsg(''); setErrorMsg(''); }}
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Full Name"
                    required
                    className="flex-1 bg-transparent text-white text-[14px] font-medium placeholder:text-gray-600 outline-none caret-[#D4AF37]"
                  />
                </div>
              </div>

              {/* Username */}
              <div className="relative group">
                <div
                  className={`flex items-center gap-3 rounded-2xl border px-4 h-[50px] transition-all duration-300 ${
                    focusedField === 'username'
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/[0.04] shadow-[0_0_20px_rgba(212,175,55,0.08)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                  }`}
                >
                  <span className={`text-[14px] font-bold shrink-0 select-none ${focusedField === 'username' ? 'text-[#D4AF37]' : 'text-gray-500'}`}>@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setSuccessMsg(''); setErrorMsg(''); }}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="username"
                    required
                    className="flex-1 bg-transparent text-white text-[14px] font-medium placeholder:text-gray-600 outline-none caret-[#D4AF37]"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="relative group">
                <div
                  className={`flex items-center gap-3 rounded-2xl border px-4 h-[50px] transition-all duration-300 ${
                    focusedField === 'phone'
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/[0.04] shadow-[0_0_20px_rgba(212,175,55,0.08)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                  }`}
                >
                  <Phone className={`w-[16px] h-[16px] transition-colors shrink-0 ${focusedField === 'phone' ? 'text-[#D4AF37]' : 'text-gray-500'}`} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setSuccessMsg(''); setErrorMsg(''); }}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Phone Number"
                    className="flex-1 bg-transparent text-white text-[14px] font-medium placeholder:text-gray-600 outline-none caret-[#D4AF37]"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3">
                {/* Log Out */}
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playTap();
                    onLogout();
                  }}
                  className="flex items-center justify-center gap-2 border border-red-500/20 bg-red-500/[0.04] hover:bg-red-500/[0.1] text-red-400 font-bold text-[13px] tracking-wide rounded-2xl px-4 h-[50px] transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  <span>LOG OUT</span>
                </button>

                {/* Save Changes */}
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`flex-1 h-[50px] rounded-2xl font-bold text-[13px] tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    isSaving
                      ? 'bg-[#D4AF37]/40 text-black/60 cursor-wait'
                      : 'bg-gradient-to-r from-[#D4AF37] to-[#C59B27] text-black hover:shadow-[0_8px_20px_rgba(212,175,55,0.25)] active:scale-[0.98]'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>SAVE CHANGES</span>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <style>{`
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slideDown {
          animation: slideDown 0.3s ease-out forwards;
        }
        @keyframes slideDown {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-5px); }
          30% { transform: translateX(4px); }
          45% { transform: translateX(-3px); }
          60% { transform: translateX(2px); }
          75% { transform: translateX(-1px); }
        }
      `}</style>
    </div>
  );
}
