import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export const metadata = {
  title: "About — Gideon Tasks",
  description:
    "What Gideon Tasks is, how the marketplace works, and answers to common questions about fees, trust levels, escrow, moderation, and disputes.",
};

interface QA {
  q: string;
  a: React.ReactNode;
}

const faqs: QA[] = [
  {
    q: "What is Gideon Tasks?",
    a: (
      <>
        A private, invite-only task marketplace. Requesters post everyday work
        — yard work, moving help, tutoring, tech help, tax prep, and more — and
        vetted doers apply, complete the work, and get paid through escrow.
      </>
    ),
  },
  {
    q: "How do I join?",
    a: (
      <>
        By invitation only. Each invite is issued by an attestor — typically a
        church, nonprofit, or other community organization that has agreed to
        vouch for new members. If you don&apos;t have an invite, ask someone
        in your community who is already on the platform.
      </>
    ),
  },
  {
    q: "How does the fee work?",
    a: (
      <>
        One Gideon fee per transaction, plus Stripe&apos;s pass-through payment
        processing fee. The Gideon fee follows a published staircase that
        steps down as the community grows — starting at 5% and reaching 1% at
        $200M+ in cumulative volume. See the{" "}
        <Link href="/fees" className="text-blue-600 hover:underline">
          full fee schedule
        </Link>
        . Gideon never marks up Stripe&apos;s processing fee.
      </>
    ),
  },
  {
    q: "Doer&rsquo;s payout vs. total I pay — which one is the price?",
    a: (
      <>
        When you post a task, you choose. &ldquo;Set the doer&rsquo;s
        payout&rdquo; means the headline number is exactly what the doer
        receives; Gideon and Stripe are added on top. &ldquo;Set the total I
        will pay&rdquo; works the opposite way — the headline is what you pay,
        and the doer receives what&rsquo;s left after fees. Either way the
        platform fee is charged exactly once.
      </>
    ),
  },
  {
    q: "How does the money flow?",
    a: (
      <>
        When a requester picks a doer, the requester&apos;s card is
        authorized — not yet charged — for the full amount. When the doer
        confirms they&apos;re starting work, the payment is captured into
        escrow. When the requester approves completion, the doer is paid out
        to their Stripe Connect account. If there is a dispute, an admin
        reviews and either pays the doer or refunds the requester.
      </>
    ),
  },
  {
    q: "What if a task isn&rsquo;t completed?",
    a: (
      <>
        Either party can dispute. An admin reviews and either releases payment
        to the doer or refunds the requester. Gideon absorbs its own fee on
        refunds. Three lost disputes in 30 days triggers automatic suspension.
      </>
    ),
  },
  {
    q: "What can I post tasks for?",
    a: (
      <>
        Most legitimate everyday work: cleaning, handyman, moving and hauling,
        yard work, errands, pet care, tutoring, computer help, event help, tax
        prep, and more. Content is auto-moderated when you publish — anything
        involving minors as task subjects, sexual content, weapons, illegal
        drugs, gambling, or trafficking is rejected. Contact information
        (phone, email, URLs) is not permitted in task descriptions; doers and
        requesters communicate through the platform until they&apos;re
        matched.
      </>
    ),
  },
  {
    q: "How does the trust system work?",
    a: (
      <>
        Four levels, all computed from your activity rather than self-claimed:
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>
            <strong>Level 0 (Verified)</strong> — registered. Can apply to
            tasks up to $100; cannot post.
          </li>
          <li>
            <strong>Level 1 (Established)</strong> — 5+ completed tasks, no
            disputes lost, 30+ day account. Unlocks posting up to $500 and 2
            active posted tasks.
          </li>
          <li>
            <strong>Level 2 (Trusted)</strong> — 20+ completed, no unresolved
            disputes, 90+ day account, 90%+ positive reviews. Up to $2,000 per
            task and 10 active posts.
          </li>
          <li>
            <strong>Level 3 (Pillar)</strong> — 50+ completed, 180+ day
            account, 95%+ positive, admin-reviewed. Up to $5,000 per task and
            25 active posts.
          </li>
        </ul>
      </>
    ),
  },
  {
    q: "How are doers and requesters reviewed?",
    a: (
      <>
        After a completed task, both parties have 7 days to leave a review.
        Reviews score four separate dimensions on a 1–5 scale: reliability,
        quality, communication, and integrity. Reviews are permanent and
        public — no edits, no deletions.
      </>
    ),
  },
  {
    q: "Can I exchange contact info to take a job off-platform?",
    a: (
      <>
        No. Phone numbers, emails, social handles, and URLs are stripped from
        task messages and rejected in task descriptions. Going off-platform
        forfeits Gideon&apos;s escrow, the doer&apos;s review history, and
        any future standing on the platform.
      </>
    ),
  },
  {
    q: "Who runs Gideon Tasks?",
    a: (
      <>
        Gideon Tasks is a product of{" "}
        <a
          href="https://www.gideonsolutions.us"
          className="text-blue-600 hover:underline"
        >
          Gideon Solutions, LLC
        </a>
        . The source code is available under the{" "}
        <a
          href="https://github.com/gideonsolutions/gideon-tasks/blob/main/LICENSE.md"
          className="text-blue-600 hover:underline"
        >
          Gideon Christian Open Source License (GCOSL) v1.0
        </a>
        .
      </>
    ),
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        <section>
          <h1 className="text-3xl font-bold text-gray-900">About Gideon Tasks</h1>
          <p className="mt-3 text-gray-700">
            Gideon Tasks is an invite-only task marketplace for community-rooted
            work. Doers are vouched for by their local church, nonprofit, or
            community organization. Payments flow through Stripe Connect with
            escrow protection, and the platform charges one transparent fee
            that decreases as the community grows.
          </p>
          <p className="mt-3 text-gray-700">
            The site is built on the conviction that a small, accountable
            community produces better outcomes than an open marketplace of
            strangers — both for the people doing the work and the people
            paying for it. Identity, reputation, and disputes all stay rooted
            in the community attestation chain rather than anonymous reviews.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href="/register"
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Register with an invite
            </Link>
            <Link
              href="/fees"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Fee schedule
            </Link>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Frequently asked</h2>
          <dl className="space-y-6">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-lg border border-gray-200 bg-white p-5">
                <dt className="font-semibold text-gray-900">{item.q}</dt>
                <dd className="mt-2 text-gray-700">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <Footer />
    </div>
  );
}
