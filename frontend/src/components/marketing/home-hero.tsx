import Image from "next/image";
import Link from "next/link";

export function HomeHero() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-start gap-4">
        <Image
          src="/gideon-logo.svg"
          alt=""
          width={64}
          height={64}
          className="shrink-0"
        />
        <h1 className="text-2xl font-bold text-gray-900">
          A trustworthy task marketplace for your community.
        </h1>
      </div>
      <p className="mt-2 text-gray-700">
        Gideon Tasks is a marketplace for everyday work — errands, repairs,
        tutoring, tax prep, and more — open to everyone in the US. You sign up
        with your email address. An invite from a church, nonprofit, or
        community organization is optional; it lets them vouch for you, which
        raises your trust. Payments go through Stripe Connect with escrow, in
        US dollars, with one published platform fee that drops as total volume
        grows.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link
          href="/register"
          className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Create an account
        </Link>
        <Link
          href="/about"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
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
