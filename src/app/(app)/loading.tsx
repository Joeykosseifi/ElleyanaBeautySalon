export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-56 rounded-xl bg-beige/60" />
      <div className="h-4 w-80 max-w-full rounded bg-beige/40" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-white shadow-soft" />
        ))}
      </div>
      <div className="h-96 rounded-3xl bg-white shadow-soft" />
    </div>
  );
}
