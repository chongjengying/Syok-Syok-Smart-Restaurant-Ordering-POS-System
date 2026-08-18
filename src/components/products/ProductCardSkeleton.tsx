export function ProductCardSkeleton() {
  return (
    <div
      className="w-full h-[330px] bg-white rounded-2xl p-4 border border-[#E9ECEF] animate-pulse"
      aria-hidden="true"
    >
      <div className="w-full h-[160px] rounded-xl bg-gray-200 mb-3" />
      <div className="h-5 w-3/4 rounded bg-gray-200" />
      <div className="h-3 w-full rounded bg-gray-100 mt-3" />
      <div className="h-3 w-2/3 rounded bg-gray-100 mt-2" />
      <div className="h-6 w-20 rounded bg-gray-200 mt-5" />
      <div className="h-[48px] w-full rounded-xl bg-gray-200 mt-4" />
    </div>
  );
}
