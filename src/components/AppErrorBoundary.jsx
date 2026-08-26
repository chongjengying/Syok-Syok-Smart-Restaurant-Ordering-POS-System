import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    console.error('POS interface crashed', error, details);
  }

  async reload() {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('smart-pos-')).map((key) => caches.delete(key)));
    }
    window.location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] p-6 text-white">
        <div className="w-full max-w-lg rounded-3xl border border-red-400/30 bg-white/5 p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-black text-red-300">The POS screen could not load</h1>
          <p className="mt-3 text-sm text-gray-300">A cached or incompatible interface module caused a runtime error.</p>
          <p className="mt-3 rounded-xl bg-black/40 p-3 text-left font-mono text-xs text-amber-200">{this.state.error.message}</p>
          <button onClick={() => void this.reload()} className="mt-5 rounded-xl bg-[#D4AF37] px-6 py-3 text-sm font-black text-black">
            Clear cache and reload
          </button>
        </div>
      </div>
    );
  }
}
