import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ClerkLoginSafety } from "@/components/clerk/login-safety";
import { CONTACT_URL } from "@/lib/constants";
import {
  CLERK_HOLD_DAYS,
  CLERK_HOURLY_CENTS,
  CLERK_MAX_HOURS,
  CLERK_MIN_HOURS,
  CLERK_SESSION_WINDOW_DAYS,
  clerkAmountCents,
  formatHours,
  formatWholeDollars,
} from "@/server/clerk-rules";

const RATE = formatWholeDollars(CLERK_HOURLY_CENTS);

export const metadata = {
  title: "Gideon Clerk — Gideon Tasks",
  description: `Help with paperwork and online accounts, ${RATE} an hour, online. A service from Gideon Solutions, LLC, the company that runs Gideon Tasks.`,
};

const BOOK = "/clerk/bookings";
const link = "text-blue-600 hover:underline";
const HOURS = Array.from(
  { length: CLERK_MAX_HOURS - CLERK_MIN_HOURS + 1 },
  (_, i) => CLERK_MIN_HOURS + i,
);
const EXAMPLE_HOURS = 2;

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <strong className="text-gray-900">{title}</strong> {children}
    </li>
  );
}

export default function ClerkPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        <section>
          <h1 className="text-3xl font-bold text-gray-900">Gideon Clerk</h1>
          <p className="mt-3 text-lg text-gray-800">
            Help with paperwork and online accounts, online, at {RATE} an hour.
          </p>
          <p className="mt-3 text-gray-700">
            Gideon Clerk is a service from Gideon Solutions, LLC, the company
            that runs Gideon Tasks. It is our own service, not a tasker: someone
            from Gideon Solutions works through your paperwork with you. It
            isn&apos;t in the task list or the categories, and it isn&apos;t
            ranked with taskers.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href={BOOK}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Book a session
            </Link>
            <Link
              href={BOOK}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Your bookings
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Price</h2>
          <p className="text-gray-800">
            <strong>{RATE} an hour, all-in.</strong> You book {CLERK_MIN_HOURS} to{" "}
            {CLERK_MAX_HOURS} whole hours at a time. You pay {RATE} for each
            hour, and nothing is added: no Gideon Tasks fee and no card fee.
          </p>
          <table className="w-full max-w-sm text-left text-gray-800">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-600">
                <th className="py-1 font-medium">You book</th>
                <th className="py-1 font-medium">Hold on your card</th>
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h) => (
                <tr key={h} className="border-b border-gray-100">
                  <td className="py-1">{formatHours(h)}</td>
                  <td className="py-1">{formatWholeDollars(clerkAmountCents(h))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-gray-800">
            You are charged only for the whole hours the session used, never
            more than you booked.
          </p>
        </section>

        <ClerkLoginSafety />

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">What we help with</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>
              <strong className="text-gray-900">Forms and applications:</strong>{" "}
              benefits, insurance, government agencies, utilities, banks, and
              DMV-type paperwork.
            </li>
            <li>
              <strong className="text-gray-900">Online accounts:</strong>{" "}
              getting into an account, recovering one you&apos;re locked out
              of, or setting up a new one.
            </li>
            <li>
              <strong className="text-gray-900">Letters:</strong> working out
              what a letter is asking for, and answering it.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">What Gideon Clerk doesn&apos;t do</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-800">
            <li>
              <strong className="text-gray-900">Tax matters,</strong> including
              tax returns and letters from a tax agency. Independent preparers
              work on Gideon Tasks: see{" "}
              <Link href="/tax-prep" className={link}>
                Tax Prep
              </Link>
              .
            </li>
            <li>
              <strong className="text-gray-900">Legal advice,</strong> or
              financial or investment advice.
            </li>
            <li>
              <strong className="text-gray-900">Notarization.</strong>
            </li>
            <li>
              <strong className="text-gray-900">Signing for you.</strong> You
              sign your own forms and applications.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">How a session works</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>
              <strong className="text-gray-900">Online only, for now.</strong> A
              video call with screen share, or a phone call. In-person sessions
              aren&apos;t offered yet.
            </li>
            <li>
              <strong className="text-gray-900">The details come by email.</strong>{" "}
              Gideon Solutions emails the time and how to join to the email
              address on your Gideon Tasks account, and the same details are on
              your bookings page. (Gideon Tasks messages can&apos;t carry links,
              so a meeting link can&apos;t be sent there.) If an email about
              your session doesn&apos;t match your bookings page, it isn&apos;t
              from us.
            </li>
            <li>
              <strong className="text-gray-900">Have things ready.</strong> Keep
              the letter, form or device you need help with nearby. You type
              every password and code yourself.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Booking and payment</h2>
          <ol className="list-decimal pl-5 space-y-3 text-gray-700">
            <Step title="Book.">
              You need a Gideon Tasks account with a confirmed email address
              and a saved card (the Payment Card page). Choose{" "}
              {CLERK_MIN_HOURS} to {CLERK_MAX_HOURS} hours and say what you
              need help with and when you&apos;re free. Don&apos;t include
              passwords, Social Security numbers or account numbers. You can
              have one open booking at a time.
            </Step>
            <Step title="A hold, not a charge.">
              Booking places a hold on your card for the hours you booked: for{" "}
              {formatHours(EXAMPLE_HOURS)}, {formatWholeDollars(clerkAmountCents(EXAMPLE_HOURS))}.
              Nothing is charged yet.
            </Step>
            <Step title={`We schedule it within ${CLERK_SESSION_WINDOW_DAYS} days.`}>
              The hold lasts up to {CLERK_HOLD_DAYS} days, so we schedule your
              session to end within {CLERK_SESSION_WINDOW_DAYS} days of booking
              and email you the time. If we can&apos;t find a time, we release
              the hold and you pay nothing.
            </Step>
            <Step title="You pay for the hours used.">
              After the session, we record the whole hours it used, never more
              than you booked, and charge only those. The rest of the hold is
              released.
            </Step>
            <Step title="Cancel before it starts and pay nothing.">
              You can cancel on your bookings page any time before the session
              starts, and the hold is released. If Gideon Clerk can&apos;t help
              with your request, we cancel the booking and release the hold.
            </Step>
          </ol>
          <p className="text-gray-700">
            Questions before you book? Write to us through the{" "}
            <a href={CONTACT_URL} className={link}>
              Gideon Solutions contact page
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href={BOOK}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Book a session
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Create an account
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
