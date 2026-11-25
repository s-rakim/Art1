export default function Loading() {
  return (
    <div className="px-4 py-6 md:px-6" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-7 w-1/2 max-w-xs animate-pulse rounded-element bg-background-dark" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-container bg-background-hover" />)}
      </div>
    </div>
  );
}
