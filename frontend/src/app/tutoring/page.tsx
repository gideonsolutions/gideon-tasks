import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import {
  CONTACT_URL,
  maxActivePosted,
  maxConcurrentDoer,
  maxTaskValueCents,
} from "@/lib/constants";
import { formatCents } from "@/lib/utils/format";

export const metadata = {
  title: "Tutoring — Gideon Tasks",
  description:
    "How tutoring works on Gideon Tasks: post a request in Tutoring, book a tutor, and pay through escrow. For learners, tutors, and schools and class providers.",
};

/** The new-task form with the Tutoring category already selected. */
const POST_TUTORING = "/tasks/new?category=tutoring";

// A new account (trust level 0) has these limits; they rise with the level.
const NEW_MAX_VALUE = formatCents(maxTaskValueCents(0)).replace(/\.00$/, "");
const NEW_MAX_POSTED = maxActivePosted(0);
const NEW_MAX_DOING = maxConcurrentDoer(0);

const link = "text-blue-600 hover:underline";

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <strong className="text-gray-900">{title}</strong> {children}
    </li>
  );
}

export default function TutoringPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        <section>
          <h1 className="text-3xl font-bold text-gray-900">Tutoring</h1>
          <p className="mt-3 text-gray-700">
            Gideon Tasks is a task marketplace open to everyone in the US, and
            tutoring works like any other task. A learner posts what they want
            to learn, with a price and a deadline. Tutors apply, the learner
            books one, and the payment is held until the learner approves the
            work. There is no tutor directory and no subscription: you pay per
            task.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href={POST_TUTORING}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Post a tutoring request
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Create an account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Log in
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Find a tutor</h2>
          <ol className="list-decimal pl-5 space-y-3 text-gray-700">
            <Step title="Create an account.">
              <Link href="/register" className={link}>
                Sign up
              </Link>{" "}
              and confirm your email address. You need a confirmed email to
              post a task.
            </Step>
            <Step title="Post a task in Tutoring.">
              Say what subject and level you need, what you want to cover, and
              how many sessions.{" "}
              <Link href={POST_TUTORING} className={link}>
                This link
              </Link>{" "}
              opens the new-task form with Tutoring selected. One task is one
              booking with one price: a single session, or a set number of
              sessions you pay for together.
            </Step>
            <Step title="Choose online or in person.">
              Pick Remote for an online session. For an in-person session,
              enter a public place, such as a library. The address you enter
              is shown on the task, so never give a home address.
            </Step>
            <Step title="Set the price and deadline.">
              You set either what the tutor receives or the total you pay, and
              the form shows the fees before you post. See the{" "}
              <Link href="/fees" className={link}>
                fee schedule
              </Link>
              . A new account can post tasks that pay the tutor up to{" "}
              {NEW_MAX_VALUE}, with {NEW_MAX_POSTED} active at a time.
            </Step>
            <Step title="Publish it.">
              Every post is checked automatically when you publish it.
            </Step>
            <Step title="Choose a tutor.">
              Tutors apply with a message, and they can ask questions on the
              task, which you answer in public. Gideon Tasks does not check
              tutors&apos; qualifications, so ask about them before you book.
            </Step>
            <Step title="Pay through escrow.">
              Save a card on the Payment Card page before you book. When you
              book a tutor, your card is authorized for the full amount but not
              charged. When the tutor starts the task, the payment is taken and
              held. When you approve the finished work, it is paid to the
              tutor. If you cancel before the tutor starts, the hold on your
              card is released.
            </Step>
          </ol>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Tutor on Gideon Tasks</h2>
          <ol className="list-decimal pl-5 space-y-3 text-gray-700">
            <Step title="Find requests.">
              Browse the tasks on the{" "}
              <Link href="/" className={link}>
                home page
              </Link>{" "}
              and pick Tutoring in the category filter.
            </Step>
            <Step title="Apply.">
              Send a short message saying how you would help. You can ask a
              question on the task first. Once a learner books you, you can
              message each other on the task.
            </Step>
            <Step title="Set up payouts.">
              Before you can start a booked task, set up payouts with Stripe on
              the Stripe Connect page. Stripe checks your identity.
            </Step>
            <Step title="Get paid.">
              Starting the task charges the learner, and the payment is held.
              When the learner approves your work, it is transferred to your
              Stripe account, and Stripe pays it out to your bank.
            </Step>
            <Step title="Know the limits.">
              A new account can take tasks that pay up to {NEW_MAX_VALUE},{" "}
              {NEW_MAX_DOING} at a time. The limits rise as you complete tasks
              and get good reviews: see the{" "}
              <Link href="/about" className={link}>
                trust levels
              </Link>
              .
            </Step>
          </ol>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">
            Schools and class providers
          </h2>
          <p className="text-gray-700">
            Organizations use the same tasks as everyone else. There are no
            class listings, timetables or group bookings.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>
              <strong className="text-gray-900">To offer lessons or classes:</strong>{" "}
              a person at the organization creates an account, sets up payouts
              with Stripe, and applies to learners&apos; Tutoring requests like
              any tutor. Each learner books with their own task, so a class of
              five learners is five tasks.
            </li>
            <li>
              <strong className="text-gray-900">To hire a tutor:</strong> post
              a Tutoring task the way a learner does.
            </li>
            <li>
              The same limits apply: a new account starts at tasks paying up to{" "}
              {NEW_MAX_VALUE}.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Safety rules</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>
              <strong className="text-gray-900">Online or in a public place.</strong>{" "}
              Tutoring sessions are online, or in person at a public place such
              as a library. Not at anyone&apos;s home.
            </li>
            <li>
              <strong className="text-gray-900">No contact details.</strong>{" "}
              Phone numbers, email addresses, social media handles and links
              are rejected in task posts, applications, questions and messages.
              Keep the conversation on Gideon Tasks: arranging a booking
              elsewhere gives up the escrow and the review history.
            </li>
            <li>
              <strong className="text-gray-900">Disputes.</strong> If the work
              was not done as agreed, do not approve it. Once the tutor marks
              the task done, you can open a dispute instead. An admin reviews
              it and either pays the tutor or refunds you.
            </li>
            <li>
              <strong className="text-gray-900">Reporting a problem.</strong>{" "}
              To report a tutor, a learner or a post, write to us through the{" "}
              <a href={CONTACT_URL} className={link}>
                Gideon Solutions contact page
              </a>
              . If someone is in immediate danger, call 911.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Under 18s</h2>
          <p className="text-gray-800">
            Tutoring for anyone under 18 is not available on Gideon Tasks yet,
            so do not post or book tutoring for a child.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
