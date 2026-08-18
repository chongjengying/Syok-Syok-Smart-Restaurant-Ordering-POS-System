import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Maximize2, User } from 'lucide-react';

export default function IpadShell({ children, deviceMode, setDeviceMode, isOnline, onLogout, userEmail, onOpenProfile }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0C] flex flex-col items-center justify-center p-2 sm:p-4 text-white overflow-hidden select-none">
      {/* Top Device Bar Mode Selector Controls */}
      <div className="mb-3 flex items-center gap-3 bg-[#1A1A1E] px-4 py-2 rounded-full border border-white/10 shadow-lg text-xs z-50">
        <span className="text-gray-400 font-medium">iPad Canvas Mode:</span>
        <button
          onClick={() => setDeviceMode('11inch')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer font-medium ${
            deviceMode === '11inch' ? 'bg-[#D4AF37] text-black font-bold shadow' : 'bg-white/5 text-gray-300 hover:bg-white/10'
          }`}
        >
          <TabletIcon className="w-3.5 h-3.5" />
          iPad 11" (1194×834pt)
        </button>
        <button
          onClick={() => setDeviceMode('129inch')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer font-medium ${
            deviceMode === '129inch' ? 'bg-[#D4AF37] text-black font-bold shadow' : 'bg-white/5 text-gray-300 hover:bg-white/10'
          }`}
        >
          <TabletIcon className="w-4 h-4" />
          iPad Pro 12.9" (1366×1024pt)
        </button>
        <button
          onClick={() => setDeviceMode('fullscreen')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer font-medium ${
            deviceMode === 'fullscreen' ? 'bg-[#D4AF37] text-black font-bold shadow' : 'bg-white/5 text-gray-300 hover:bg-white/10'
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Fullscreen Responsive
        </button>

        {/* Network Status Badge */}
        <div className="h-4 w-px bg-white/20 mx-1" />
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${
          isOnline ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-amber-950 text-amber-400 border border-amber-800/50'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          {isOnline ? '🟢 Online (PWA)' : '🟠 Offline Mode'}
        </div>
      </div>

      {/* iPad Outer Bezel & Canvas Frame */}
      <div
        className={`relative flex flex-col transition-all duration-300 overflow-hidden bg-[#F8F9FA] text-[#121212] ${
          deviceMode === '11inch'
            ? 'w-[1194px] h-[834px] rounded-[36px] border-[14px] border-[#1C1C1E] shadow-[0_25px_60px_rgba(0,0,0,0.8)]'
            : deviceMode === '129inch'
            ? 'w-[1366px] h-[1024px] rounded-[42px] border-[16px] border-[#1C1C1E] shadow-[0_30px_70px_rgba(0,0,0,0.9)]'
            : 'w-full max-w-[1400px] h-[92vh] rounded-2xl border-4 border-[#1C1C1E] shadow-2xl'
        }`}
      >
        {/* iOS iPad Status Bar Header */}
        <div className="h-8 bg-[#121212] text-white px-6 flex items-center justify-between text-xs font-semibold tracking-wide shrink-0 z-40 select-none">
          <div className="flex items-center gap-2">
            <span>{time}</span>
            <span className="text-[10px] text-gray-400 font-normal">iPad Landscape @2x</span>
          </div>

          {/* iPad Top Camera Notch Dot */}
          <div className="w-3 h-3 bg-black rounded-full border border-gray-800 flex items-center justify-center">
            <div className="w-1 h-1 bg-blue-900/60 rounded-full" />
          </div>

          <div className="flex items-center gap-3">
            {userEmail && onLogout && (
              <>
                {onOpenProfile && (
                  <>
                    <button
                      onClick={onOpenProfile}
                      className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-white transition-colors cursor-pointer font-semibold bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-full"
                      title="View Profile"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Profile</span>
                    </button>
                    <div className="h-3 w-px bg-white/20" />
                  </>
                )}
                <span className="text-[10px] text-gray-400 font-medium truncate max-w-[160px]">
                  {userEmail}
                </span>
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1 text-[10px] text-[#D4AF37] hover:text-[#FFF0B3] transition-colors cursor-pointer font-semibold bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-full"
                  title="Lock Terminal"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Lock
                </button>
                <div className="h-3 w-px bg-white/20" />
              </>
            )}
            <Wifi className="w-3.5 h-3.5 text-gray-200" />
            <div className="flex items-center gap-1 text-[11px]">
              <span>100%</span>
              <Battery className="w-4 h-4 text-emerald-400 fill-emerald-400" />
            </div>
          </div>
        </div>

        {/* Main Tablet Screen App Content Area */}
        <div className="flex-1 relative overflow-hidden flex flex-col bg-[#F8F9FA]">
          {children}
        </div>

        {/* iPad Home Indicator Bar */}
        <div className="h-4 bg-[#121212] flex items-center justify-center shrink-0 z-40">
          <div className="w-36 h-1 bg-white/40 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function TabletIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="18" cy="12" r="0.75" fill="currentColor" />
    </svg>
  );
}
