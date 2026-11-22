import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import {
  ATTESTED_LEVEL_1_REQUIREMENTS,
  LEVEL_1_REQUIREMENTS,
} from "@/lib/constants";

const L1 = LEVEL_1_REQUIREMENTS;
const L1_ATTESTED = ATTESTED_LEVEL_1_REQUIREMENTS;

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
        A task marketplace open to everyone in the US. Requesters post
        everyday work — yard work, moving help,{" "}
        <Link href="/tutoring" className="text-blue-600 hover:underline">
          tutoring
        </Link>
        , tech help,{" "}
        <Link href="/tax-prep" className="text-blue-600 hover:underline">
          tax prep
        </Link>
        , and more — and doers apply, complete the work,
        and get paid through escrow. Payments are in US dollars.
      </>
    ),
  },
  {
    q: "How do I join?",
    a: (
      <>
        <Link href="/register" className="text-blue-600 hover:underline">
          Create an account
        </Link>{" "}
        with your name, email address, phone number, and a password. We email
        you a link to confirm your address; you need a confirmed email to post
        tasks or apply for them. Stripe checks a requester’s card when they
        book a doer, and checks a doer’s identity when they set up payouts.
      </>
    ),
  },
  {
    q: "Do I need an invite?",
    a: (
      <>
        No. Invites are optional. An invite is issued by an attestor — a
        church, nonprofit, or other community organization that has agreed to
        vouch for its members. If you sign up with an invite, the attestor is
        asked to confirm that they know you. Once they confirm, you can reach
        trust level 1 sooner: {L1_ATTESTED.completedTasks} completed tasks and
        a {L1_ATTESTED.accountAgeDays}-day-old account instead of{" "}
        {L1.completedTasks} and {L1.accountAgeDays} days. See the trust levels
        below.
      </>
    ),
  },
  {
    q: "How does the fee work?",
    a: (
      <>
        One Gideon fee per transaction, plus Stripe’s pass-through payment
        processing fee. The Gideon fee follows a published staircase that
        steps down as the community grows — starting at 5% and reaching 1% at
        $200M+ in cumulative volume. See the{" "}
        <Link href="/fees" className="text-blue-600 hover:underline">
          full fee schedule
        </Link>
        . Gideon never marks up Stripe’s processing fee.
      </>
    ),
  },
  {
    q: "Doer’s payout vs. total I pay — which one is the price?",
    a: (
      <>
        When you post a task, you choose. “Set the doer’s payout” means the
        headline number is exactly what the doer receives; Gideon and Stripe
        are added on top. “Set the total I will pay” works the opposite way
        — the headline is what you pay, and the doer receives what’s left
        after fees. Either way the platform fee is charged exactly once.
      </>
    ),
  },
  {
    q: "How does the money flow?",
    a: (
      <>
        Requesters save a card first; Stripe stores it, not Gideon Tasks.
        When a requester picks a doer, the card is authorized — not yet
        charged — for the full amount, and the bank may ask the requester to
        confirm the payment. When the doer confirms they’re starting work, the
        payment is captured into escrow; doers must set up payouts with
        Stripe before they can start. When the requester approves completion,
        the doer is paid out to their Stripe Connect account. If the requester
        cancels before work starts, the hold is released. If there is a
        dispute, an admin reviews and either pays the doer or refunds the
        requester.
      </>
    ),
  },
  {
    q: "What if a task isn’t completed?",
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
        yard work, errands, pet care,{" "}
        <Link href="/tutoring" className="text-blue-600 hover:underline">
          tutoring
        </Link>
        , computer help, event help,{" "}
        <Link href="/tax-prep" className="text-blue-600 hover:underline">
          tax prep
        </Link>
        , and more. Content is auto-moderated when you publish — anything
        involving minors as task subjects, childcare, sexual content, weapons,
        illegal drugs, gambling, or trafficking is rejected. The one exception
        for minors is tutoring that a parent or guardian posts for their
        child, under the{" "}
        <Link href="/safeguarding" className="text-blue-600 hover:underline">
          safeguarding rules
        </Link>
        . Contact information
        (phone, email, URLs) is not permitted in task descriptions; doers and
        requesters communicate through the platform until they’re matched.
        Social Security numbers and ITINs are rejected in every post and
        message.
      </>
    ),
  },
  {
    q: "How does the trust system work?",
    a: (
      <>
        Four levels, all computed from your activity rather than self-claimed.
        At every level you need a confirmed email address to post or apply.
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>
            <strong>Level 0 (New)</strong> — any account. Can post tasks up
            to $100 each, with up to 2 active at a time, and apply to tasks up
            to $100.
          </li>
          <li>
            <strong>Level 1 (Established)</strong> — {L1.completedTasks}+
            completed tasks, no disputes lost, {L1.accountAgeDays}+ day account.
            Raises the limit to $500 per task, still with 2 active posted
            tasks. If an attestor has confirmed that they know you, and has not
            withdrawn it, level 1 needs half the tasks (rounded up) and half
            the account age: {L1_ATTESTED.completedTasks}+ completed tasks and a{" "}
            {L1_ATTESTED.accountAgeDays}+ day account. You still need no lost
            disputes.
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
        <p className="mt-2">
          Being vouched for only ever shortens the path to level 1. It does not
          change the requirements for levels 2 and 3, and it never replaces
          the dispute and review conditions. A confirmation only counts while
          the attestor is active, and if the attestor withdraws it, your level
          is worked out again without it.
        </p>
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
        forfeits Gideon’s escrow, the doer’s review history, and any future
        standing on the platform.
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
          <div className="flex items-center gap-4">
            <Image
              src="/gideon-logo.svg"
              alt=""
              width={64}
              height={64}
              className="shrink-0"
            />
            <h1 className="text-3xl font-bold text-gray-900">About Gideon Tasks</h1>
          </div>
          <p className="mt-3 text-gray-700">
            Gideon Tasks is a task marketplace open to everyone in the US.
            Anyone can sign up with an email address. An invite from a local
            church, nonprofit, or community organization is optional: it lets
            that organization vouch for you, which lets you reach the first
            trust level sooner. Payments
            flow through Stripe Connect with escrow protection, and the
            platform charges one transparent fee that decreases as the
            community grows.
          </p>
          <p className="mt-3 text-gray-700">
            Trust is earned on the platform rather than claimed. New accounts
            start with small limits, and the limits rise with completed tasks,
            account age, and reviews. Reviews are public and permanent, and an
            admin reviews every dispute.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href="/register"
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Create an account
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
