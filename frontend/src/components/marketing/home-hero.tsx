import Link from "next/link";

export function HomeHero() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-bold text-gray-900">
        A trustworthy task marketplace for your community.
      </h1>
      <p className="mt-2 text-gray-700">
        Gideon Tasks is an invite-only marketplace for everyday work — errands,
        repairs, tutoring, tax prep, and more. Doers are vouched for by their
        local church, nonprofit, or community organization. Payments flow
        through Stripe Connect with escrow protection, and a single transparent
        platform fee that drops as the community grows.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link
          href="/about"
          className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Learn more
        </Link>
        <Link
          href="/fees"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
        >
          Fee schedule
        </Link>
      </div>
    </section>
  );
}
