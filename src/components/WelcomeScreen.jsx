import React from 'react';
import { ChefHat, ArrowRight, BellRing, Download, Globe, ClipboardList, TrendingUp, UtensilsCrossed, ReceiptText, PackageSearch, Settings } from 'lucide-react';
import { LANGUAGE_LABELS, translations, translate } from '../utils/i18n';
import { soundFx } from '../utils/audio';
import { APP_VERSION } from '../config/appVersion';

export default function WelcomeScreen({
  onStartOrder,
  onOpenKitchen,
  onOpenReadyToServe,
  onOpenReports,
  onOpenTables,
  onOpenUnpaidOrders,
  onOpenProducts,
  onOpenAdmin,
  canStartOrder,
  canManageProducts,
  canAccessAdmin,
  canAccessKitchen,
  canAccessReadyToServe,
  canAccessReports,
  canAccessTables,
  canAccessUnpaidOrders,
  lang,
  setLang,
  installPrompt,
  handleInstallPwa,
}) {
  const t = translations[lang] || translations.en;
  const tr = (key, variables) => translate(lang, key, variables);

  const handleStart = () => {
    soundFx.playTap();
    onStartOrder();
  };

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-8 overflow-hidden bg-[#121212] text-white">
      {/* Background Hero Media with 40% dark overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105 transition-transform duration-10000 animate-pulse-subtle"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1600&q=85')`
        }}
      />
      {/* Gradient Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-[#121212]/40" />

      {/* Top Header Row with Language Switcher */}
      <div className="relative z-10 flex items-center justify-between">
        {/* Top Left PWA Badge */}
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs">
          <Globe className="w-4 h-4 text-[#D4AF37]" />
          <span className="text-gray-300 font-medium">{tr('terminalBadge')}</span>
        </div>

        {/* Top Right Segmented Language Control (48pt height) */}
        <div className="flex items-center bg-black/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/15 shadow-2xl">
          {[
            { code: 'en', label: LANGUAGE_LABELS.en },
            { code: 'zh', label: LANGUAGE_LABELS.zh },
            { code: 'ms', label: LANGUAGE_LABELS.ms }
          ].map((item) => (
            <button
              key={item.code}
              onClick={() => {
                soundFx.playTap();
                setLang(item.code);
              }}
              className={`h-[48px] px-5 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer ${
                lang === item.code
                  ? 'bg-[#D4AF37] text-black shadow-lg scale-[1.02]'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Center Branding Cluster */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto max-w-3xl mx-auto space-y-6">
        {/* Restaurant Logo Badge (160x160pt) */}
        <div className="w-[160px] h-[160px] rounded-full bg-gradient-to-br from-[#D4AF37] via-[#B8952B] to-[#121212] p-1 shadow-[0_12px_40px_rgba(212,175,55,0.4)] flex items-center justify-center animate-bounce-subtle">
          <div className="w-full h-full rounded-full bg-[#121212] flex flex-col items-center justify-center border border-[#D4AF37]/40 p-4">
            <ChefHat className="w-14 h-14 text-[#D4AF37] mb-1" />
            <span className="text-xs tracking-widest text-[#D4AF37] font-bold uppercase">LUXURY POS</span>
          </div>
        </div>

        {/* Welcome Headline (text-display 42pt Bold) */}
        <div className="space-y-3">
          <h1 className="text-[42px] font-extrabold tracking-tight text-white leading-[50px] drop-shadow-md">
            {t.welcomeTitle}
          </h1>
          <p className="text-gray-300 text-lg font-normal max-w-xl mx-auto">
            {t.welcomeSubtitle}
          </p>
        </div>

        {/* Action Center: Large Primary Button (320x72pt) */}
        <div className="pt-4 flex flex-col items-center gap-4">
          {canStartOrder && (
            <button
              onClick={handleStart}
              className="w-[320px] h-[72px] rounded-[20px] bg-gradient-to-r from-[#D4AF37] to-[#C59B27] text-black font-bold text-xl tracking-wider shadow-[0_12px_32px_rgba(212,175,55,0.4)] hover:shadow-[0_16px_40px_rgba(212,175,55,0.6)] active:scale-95 transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer border border-[#FFF0B3]/40"
            >
              <span>{t.startOrder}</span>
              <ArrowRight className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}

          {(canAccessKitchen || canAccessReadyToServe || canAccessReports || canAccessTables || canAccessUnpaidOrders || canManageProducts || canAccessAdmin) && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {canAccessUnpaidOrders && (
                <button onClick={onOpenUnpaidOrders} className="h-11 rounded-xl border border-white/20 bg-black/50 px-4 text-xs font-bold text-white flex items-center gap-2 hover:border-[#D4AF37]">
                  <ReceiptText className="w-4 h-4 text-[#D4AF37]" /> {tr('unpaidOrderAction')}
                </button>
              )}
              {canAccessKitchen && (
                <button onClick={onOpenKitchen} className="h-11 rounded-xl border border-white/20 bg-black/50 px-4 text-xs font-bold text-white flex items-center gap-2 hover:border-[#D4AF37]">
                  <ClipboardList className="w-4 h-4 text-[#D4AF37]" /> {tr('kitchenQueue')}
                </button>
              )}
              {canAccessReadyToServe && (
                <button onClick={onOpenReadyToServe} className="h-11 rounded-xl border border-emerald-400/40 bg-emerald-950/60 px-4 text-xs font-bold text-white flex items-center gap-2 hover:border-emerald-400">
                  <BellRing className="w-4 h-4 text-emerald-400" /> {tr('readyServeCollect')}
                </button>
              )}
              {canAccessReports && (
                <button onClick={onOpenReports} className="h-11 rounded-xl border border-white/20 bg-black/50 px-4 text-xs font-bold text-white flex items-center gap-2 hover:border-[#D4AF37]">
                  <TrendingUp className="w-4 h-4 text-[#D4AF37]" /> {tr('salesReports')}
                </button>
              )}
              {canAccessTables && (
                <button onClick={onOpenTables} className="h-11 rounded-xl border border-white/20 bg-black/50 px-4 text-xs font-bold text-white flex items-center gap-2 hover:border-[#D4AF37]">
                  <UtensilsCrossed className="w-4 h-4 text-[#D4AF37]" /> {tr('tableOperations')}
                </button>
              )}
              {canManageProducts && (
                <button onClick={onOpenProducts} className="h-11 rounded-xl border border-white/20 bg-black/50 px-4 text-xs font-bold text-white flex items-center gap-2 hover:border-[#D4AF37]">
                  <PackageSearch className="w-4 h-4 text-[#D4AF37]" /> Products
                </button>
              )}
              {canAccessAdmin && (
                <button onClick={onOpenAdmin} className="h-11 rounded-xl border border-[#D4AF37]/50 bg-black/70 px-4 text-xs font-bold text-white flex items-center gap-2 hover:border-[#D4AF37]">
                  <Settings className="w-4 h-4 text-[#D4AF37]" /> Administration
                </button>
              )}
            </div>
          )}

          {/* Optional PWA Install Prompt Button */}
          {installPrompt && (
            <button
              onClick={handleInstallPwa}
              className="flex items-center gap-2 text-xs text-[#D4AF37] bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full backdrop-blur-sm transition-all"
            >
              <Download className="w-4 h-4" />
              <span>{t.installPwa}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="relative z-10 flex flex-col items-start gap-3 border-t border-white/10 pt-4 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
        <span>{tr('footerVersion')} · {APP_VERSION}</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            {tr('footerKitchenConnected')}
          </span>
          <span>{tr('footerTouchOptimized')}</span>
        </div>
      </div>
    </div>
  );
}
