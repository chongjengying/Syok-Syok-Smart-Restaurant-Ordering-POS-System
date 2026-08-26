import { RefreshCw } from 'lucide-react';

interface ProductLoadErrorProps {
  message: string;
  onRetry: () => void | Promise<void>;
  isRetrying?: boolean;
}

export function ProductLoadError({ message, onRetry, isRetrying = false }: ProductLoadErrorProps) {
  return (
    <div className="col-span-full rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
      <p className="font-semibold">{message}</p>
      <button
        type="button"
        onClick={() => { void onRetry(); }}
        disabled={isRetrying}
        className="mx-auto mt-3 flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 font-bold text-white disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
        {isRetrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
