import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative overflow-hidden px-6 py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(10,122,118,0.2),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(199,74,38,0.22),transparent_35%)]" />
      <div className="mx-auto max-w-5xl space-y-10 text-center">
        <p className="mx-auto w-fit rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
          Navio-AI Decision Agent
        </p>
        <h1 className="font-serif text-5xl leading-tight md:text-7xl">
          Choose where to stay with itinerary logic first, search second.
        </h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
          Navio-AI is not a trip planner and not a generic search tool. It picks the
          best area first, runs live accommodation checks in that area, and returns
          the best viable stay with transparent trade-offs.
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <span className="rounded-full border px-4 py-1">Area-first reasoning</span>
          <span className="rounded-full border px-4 py-1">TinyFish live browsing</span>
          <span className="rounded-full border px-4 py-1">Full site audit trail</span>
          <span className="rounded-full border px-4 py-1">PDF and DOCX support</span>
        </div>
        <Link
          href="/search"
          className="inline-flex rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:opacity-90"
        >
          Start Search
        </Link>
      </div>
    </div>
  );
}
