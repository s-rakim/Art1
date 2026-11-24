export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10" aria-busy="true" aria-label="Loading">
      <div className="mb-8 h-14 w-2/3 max-w-md animate-pulse bg-paper-2" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse bg-paper-2" />)}
      </div>
    </div>
  );
}
