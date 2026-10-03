export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 -right-32 size-[28rem] rounded-full bg-blush/70 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-32 size-[26rem] rounded-full bg-gold-soft/80 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-5xl font-bold tracking-tight text-ink">
            Salon<span className="text-rose">Flow</span>
          </p>
          <p className="mt-1 text-sm text-muted">Your salon, beautifully in order.</p>
        </div>
        <div className="rounded-3xl border border-beige/70 bg-white/90 p-6 shadow-lift backdrop-blur sm:p-7">{children}</div>
      </div>
    </div>
  );
}
