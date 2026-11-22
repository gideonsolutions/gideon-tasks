import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CONTACT_URL, GUARDIAN_TICK_LABEL } from "@/lib/constants";

export const metadata = {
  title: "Safeguarding — Gideon Tasks",
  description:
    "The rules for tutoring a child under 18 on Gideon Tasks: the parent or guardian holds the account, only background-checked tutors, sessions online or in a public place, and how to report a concern.",
};

const link = "text-blue-600 hover:underline";

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <div className="space-y-3 text-gray-700">{children}</div>
    </section>
  );
}

export default function SafeguardingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        <section>
          <h1 className="text-3xl font-bold text-gray-900">Safeguarding</h1>
          <p className="mt-3 text-gray-700">
            These are the rules for tutoring a child under 18 on Gideon Tasks.
            They apply to the parent or guardian who posts the task and to
            every tutor who applies. Where the site enforces a rule, it says
            so. For how tutoring works in general, see{" "}
            <Link href="/tutoring" className={link}>
              Tutoring
            </Link>
            .
          </p>
        </section>

        <Section title="The parent or guardian holds the account">
          <p>
            Accounts are for adults. A child does not get an account and does
            not post, apply or send messages. Their parent or legal guardian
            posts the task in Tutoring from their own account and ticks
            &ldquo;{GUARDIAN_TICK_LABEL}&rdquo;. Only a Tutoring task can
            carry that tick.
          </p>
          <p>
            The task, including any place you give, is visible to everyone.
            Do not include your child&apos;s name or school.
          </p>
        </Section>

        <Section id="background-checks" title="Only background-checked tutors">
          <p>
            Only an adult tutor whose background check Gideon Tasks has
            recorded can apply to, ask a question on, or be booked for a task
            for a child. The site enforces this when a tutor applies, asks a
            question, and is booked.
          </p>
          <p>
            A third-party provider runs the check. An admin reviews the
            provider&apos;s report and records the check only if the report
            confirms the tutor&apos;s identity, that they are 18 or older,
            and a clear result. An admin can clear a recorded check at any
            time, for example after a concern is reported. The tutor then
            can&apos;t apply to or be booked for new tasks for a child.
          </p>
          <p>
            <strong className="text-gray-900">Requesting a check:</strong>{" "}
            tutors can&apos;t request a check on the site yet. To ask about
            one, write to us through the{" "}
            <a href={CONTACT_URL} className={link}>
              Gideon Solutions contact page
            </a>
            .
          </p>
        </Section>

        <Section title="A background check is not a guarantee">
          <p>
            A background check only shows what the provider&apos;s records
            held when it was run. It does not prove that someone is safe, and
            it does not replace your own judgement or the rules on this page.
          </p>
        </Section>

        <Section title="Where sessions happen">
          <p>
            Sessions are online, or in person at a public place, such as a
            library. Never at the tutor&apos;s home or the child&apos;s. A
            task for a child must be Remote, or In person at an address the
            parent or guardian confirms is a public place. The site will not
            save it otherwise.
          </p>
        </Section>

        <Section title="The parent or guardian stays present or reachable">
          <p>
            A parent or guardian is present or reachable during every session,
            online or in person.
          </p>
        </Section>

        <Section title="No contact with the child off Gideon Tasks">
          <p>
            The tutor has no contact with the child outside the booked
            sessions: no phone calls, texts, email, social media, messaging
            apps or meetings. The tutor arranges everything with the parent or
            guardian, in the task&apos;s messages. Phone numbers, email
            addresses, social media handles and links are rejected in task
            posts, applications, questions and messages.
          </p>
        </Section>

        <Section id="report" title="Reporting a concern">
          <p>
            <strong className="text-gray-900">
              If a child is in immediate danger, call 911.
            </strong>
          </p>
          <p>
            Otherwise, tell us through the{" "}
            <a href={CONTACT_URL} className={link}>
              Gideon Solutions contact page
            </a>
            . Include a link to the task and what happened. An admin reviews
            every report. An admin can clear a tutor&apos;s background check,
            and suspend or ban an account. Where the law requires it, we also
            report to the authorities.
          </p>
          <p>
            You can also report directly to your local police or child
            protective services. Report the online exploitation of a child to
            the National Center for Missing &amp; Exploited Children&apos;s
            CyberTipline at{" "}
            <a href="https://report.cybertip.org/" className={link}>
              report.cybertip.org
            </a>{" "}
            or 1-800-843-5678.
          </p>
        </Section>

        <Section title="Payments and disputes">
          <p>
            Payment works as for any task: it is held in escrow and paid to
            the tutor when the parent or guardian approves the work. A dispute
            can be opened once the tutor marks the task done. An admin then
            reviews it and either pays the tutor or refunds the parent or
            guardian. See{" "}
            <Link href="/tutoring" className={link}>
              Tutoring
            </Link>
            .
          </p>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
