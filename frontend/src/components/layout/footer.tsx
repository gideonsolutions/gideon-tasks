import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-2 text-center text-sm text-gray-500">
        <nav className="flex flex-wrap justify-center gap-4">
          <Link href="/about" className="hover:text-gray-700">
            About
          </Link>
          <Link href="/fees" className="hover:text-gray-700">
            Fees
          </Link>
          <a
            href="https://github.com/gideonsolutions/gideon-tasks/blob/main/LICENSE.md"
            className="hover:text-gray-700"
          >
            License
          </a>
        </nav>
        <p>Gideon Tasks &mdash; Licensed under GCOSL v1.0</p>
        <p>
          A product of{" "}
          <a
            href="https://www.gideonsolutions.us"
            className="text-blue-600 hover:underline"
          >
            Gideon Solutions, LLC
          </a>
        </p>
      </div>
    </footer>
  );
}
