import { ChefHat, RefreshCw } from 'lucide-react';

interface ProductEmptyStateProps {
  message: string;
  onRefresh?: () => void | Promise<void>;
}

export function ProductEmptyState({ message, onRefresh }: ProductEmptyStateProps) {
  return (
    <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
      <ChefHat className="mx-auto mb-3 h-9 w-9 text-gray-300" />
      <p className="font-semibold text-gray-700">{message}</p>
      {onRefresh && (
        <button
          type="button"
          onClick={() => { void onRefresh(); }}
          className="mx-auto mt-4 flex items-center gap-2 rounded-xl bg-[#121212] px-4 py-2 text-xs font-bold text-[#D4AF37]"
        >
          <RefreshCw className="h-4 w-4" /> Refresh products
        </button>
      )}
    </div>
  );
}
