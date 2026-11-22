import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import {
  CONTACT_URL,
  IRS_HELP_SLUG,
  IRS_PREPARER_DIRECTORY_URL,
  maxActivePosted,
  maxConcurrentDoer,
  maxTaskValueCents,
  TAX_PREP_SLUG,
} from "@/lib/constants";
import { formatCents } from "@/lib/utils/format";

export const metadata = {
  title: "Tax Prep — Gideon Tasks",
  description:
    "How tax prep works on Gideon Tasks: post the returns you need prepared, book a preparer whose current PTIN we have recorded, and pay through escrow. Help with IRS notices from enrolled agents, CPAs and attorneys. For filers and for preparers.",
};

/** The new-task form with the Tax Prep category already selected. */
const POST_TAX_PREP = `/tasks/new?category=${TAX_PREP_SLUG}`;
/** The new-task form with IRS Notices & Representation selected. */
const POST_IRS_HELP = `/tasks/new?category=${IRS_HELP_SLUG}`;

// A new account (trust level 0) has these limits; they rise with the level.
const NEW_MAX_VALUE = formatCents(maxTaskValueCents(0)).replace(/\.00$/, "");
const NEW_MAX_POSTED = maxActivePosted(0);
const NEW_MAX_DOING = maxConcurrentDoer(0);

// Official sources for the rules this page states.
/** 26 CFR 1.6109-2(d), (g): a paid preparer of all or substantially all of a return must have a PTIN. */
const PTIN_RULE_URL = "https://www.ecfr.gov/current/title-26/section-1.6109-2";
/** "All PTINs expire on Dec. 31 of each year and are required to be renewed." */
const PTIN_RENEWAL_URL =
  "https://www.irs.gov/tax-professionals/frequently-asked-questions-ptin-application-renewal-assistance";
/** How to get or renew a PTIN. */
const PTIN_URL = "https://www.irs.gov/tax-professionals/ptin-requirements-for-tax-return-preparers";
/** 26 CFR 301.7216-3: a preparer may not use or disclose return information without the taxpayer's written consent. */
const SECTION_7216_CONSENT_URL = "https://www.ecfr.gov/current/title-26/section-301.7216-3";
/** IRS Free File. */
const IRS_FREE_FILE_URL = "https://www.irs.gov/freefile";
/** 31 CFR 10.3 (Circular 230): who may practice before the IRS. */
const CIRCULAR_230_URL = "https://www.ecfr.gov/current/title-31/section-10.3";
/** "Enrolled agents, certified public accountants, and attorneys have unlimited representation rights before the IRS." */
const IRS_CREDENTIALS_URL =
  "https://www.irs.gov/tax-professionals/understanding-tax-return-preparer-credentials-and-qualifications";
/** "Use Form 2848 to authorize an individual to represent you before the IRS." */
const FORM_2848_URL = "https://www.irs.gov/forms-pubs/about-form-2848";
/** Reporting a paid preparer to the IRS (Form 14157). */
const IRS_PREPARER_MISCONDUCT_URL =
  "https://www.irs.gov/help/report-fraud/tax-return-preparer-misconduct";

const link = "text-blue-600 hover:underline";

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <strong className="text-gray-900">{title}</strong> {children}
    </li>
  );
}

export default function TaxPrepPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        <section>
          <h1 className="text-3xl font-bold text-gray-900">Tax Prep</h1>
          <p className="mt-3 text-gray-700">
            Gideon Tasks is a task marketplace open to everyone in the US, and
            tax prep works like any other task. You post the returns you need
            prepared, with a price and a deadline. Preparers whose PTIN Gideon
            Tasks has recorded for this year apply, you book one, and the
            payment is held until you approve the work. Gideon Tasks does not
            prepare returns or check a preparer&apos;s work. For help with a
            notice from the IRS, see{" "}
            <a href="#irs-help" className={link}>
              IRS Notices &amp; Representation
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href={POST_TAX_PREP}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Post a Tax Prep task
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
          <h2 className="text-xl font-bold text-gray-900">Get a return prepared</h2>
          <ol className="list-decimal pl-5 space-y-3 text-gray-700">
            <Step title="Create an account.">
              <Link href="/register" className={link}>
                Sign up
              </Link>{" "}
              and confirm your email address. You need a confirmed email to
              post a task.
            </Step>
            <Step title="Post a task in Tax Prep.">
              Say which returns you need, for example a federal Form 1040 and
              a state return, which tax years, and which states. Say what you
              have, such as two W-2s and a 1099-INT, without any of the numbers
              on them.{" "}
              <Link href={POST_TAX_PREP} className={link}>
                This link
              </Link>{" "}
              opens the new-task form with Tax Prep selected. One task is one
              booking with one price.
            </Step>
            <Step title="Keep your numbers out of it.">
              Never put a Social Security number, ITIN, tax documents, or bank
              or other account numbers in a task, application, question or
              message. Tasks and questions are public. A post or message with a
              Social Security number or ITIN in it is rejected.
            </Step>
            <Step title="Set the price and deadline.">
              You set either what the preparer receives or the total you pay,
              and the form shows the fees before you post. See the{" "}
              <Link href="/fees" className={link}>
                fee schedule
              </Link>
              . Leave the preparer time before your filing deadline. A new
              account can post tasks that pay up to {NEW_MAX_VALUE}, with{" "}
              {NEW_MAX_POSTED} active at a time.
            </Step>
            <Step title="Publish it.">
              Every post is checked automatically when you publish it.
            </Step>
            <Step title="Choose a preparer.">
              Only preparers whose PTIN Gideon Tasks has recorded for this
              calendar year can apply, ask questions or be booked. An
              application shows &ldquo;PTIN on file for&rdquo; the year, and a
              badge for a credential we have recorded: Enrolled Agent, CPA or
              Attorney. Gideon Tasks does not check a preparer&apos;s work, so
              ask about their experience before you book.
            </Step>
            <Step title="Pay through escrow.">
              Save a card on the Payment Card page before you book. When you
              book a preparer, your card is authorized for the full amount but
              not charged. When the preparer starts the task, the payment is
              taken and held. When you approve the finished work, it is paid to
              the preparer. If you cancel before the preparer starts, the hold
              on your card is released.
            </Step>
          </ol>
        </section>

        <section
          id="documents"
          className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-3"
        >
          <h2 className="text-xl font-bold text-gray-900">
            Getting your documents to the preparer
          </h2>
          <p className="text-gray-800">
            Gideon Tasks doesn&apos;t hold tax documents. There is no upload,
            and messages reject links, email addresses and phone numbers, so
            you can&apos;t send documents through the site.
          </p>
          <p className="text-gray-800">
            What works today is meeting in person. Choose In person and enter
            a public place, such as a library; the address is shown on the
            task, so never give a home address. Bring your documents to the
            session and take them home with you. If the preparer needs your
            Social Security number for the return, give it to them there, not
            in a message.
          </p>
          <p className="text-gray-800">
            If you choose Remote, the site gives you and the preparer no way to
            exchange documents.
          </p>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Filing it yourself</h2>
          <p className="text-gray-700">
            The IRS lists free ways to file your own federal return:{" "}
            <a href={IRS_FREE_FILE_URL} className={link}>
              IRS Free File
            </a>
            .
          </p>
        </section>

        <section
          id="preparers"
          className="rounded-lg border border-gray-200 bg-white p-5 space-y-3"
        >
          <h2 className="text-xl font-bold text-gray-900">Prepare returns on Gideon Tasks</h2>
          <ol className="list-decimal pl-5 space-y-3 text-gray-700">
            <Step title="Have a current PTIN.">
              Anyone paid to prepare all or substantially all of a federal
              return or claim for refund must have a PTIN{" "}
              (<a href={PTIN_RULE_URL} className={link}>26 CFR 1.6109-2</a>),
              and{" "}
              <a href={PTIN_RENEWAL_URL} className={link}>
                PTINs expire on December 31
              </a>{" "}
              each year. The IRS explains how to{" "}
              <a href={PTIN_URL} className={link}>
                get or renew one
              </a>
              . On Gideon Tasks, only a preparer whose PTIN we have recorded for
              the current calendar year can apply to, ask about, or be booked
              for a Tax Prep task.
            </Step>
            <Step title="Have it recorded.">
              Write to us through the{" "}
              <a href={CONTACT_URL} className={link}>
                Gideon Solutions contact page
              </a>{" "}
              with the email address of your account, your PTIN, and any
              credential you hold. An admin looks you up in the IRS{" "}
              <a href={IRS_PREPARER_DIRECTORY_URL} className={link}>
                Directory of Federal Tax Return Preparers with Credentials and
                Select Qualifications
              </a>{" "}
              and, for a CPA, with the state board of accountancy, then records
              your PTIN for this year. The directory lists only preparers with a
              credential or an Annual Filing Season Program record of
              completion, so tell us if you aren&apos;t in it. Each January
              your record lapses until you have renewed your PTIN and we have
              recorded the new year.
            </Step>
            <Step title="Badges.">
              Your applications and profile show &ldquo;PTIN on file for&rdquo;
              the current year, and a badge for a credential we have recorded:
              Enrolled Agent, CPA or Attorney. Your PTIN itself is never shown.
            </Step>
            <Step title="Your state's rules.">
              You are responsible for any licensing or registration rules that
              a state has for paid preparers.
            </Step>
            <Step title="Your clients' information.">
              You may not use or disclose a client&apos;s tax return
              information for anything other than preparing their return
              without their written consent (26 U.S.C. 7216;{" "}
              <a href={SECTION_7216_CONSENT_URL} className={link}>
                26 CFR 301.7216-3
              </a>
              ).
            </Step>
            <Step title="Get paid.">
              Before you can start a booked task, set up payouts with Stripe on
              the Stripe Connect page; Stripe checks your identity. Starting
              the task charges the filer, and the payment is held. When they
              approve your work, it is transferred to your Stripe account. A new
              account can take tasks that pay up to {NEW_MAX_VALUE},{" "}
              {NEW_MAX_DOING} at a time; the limits rise with the{" "}
              <Link href="/about" className={link}>
                trust levels
              </Link>
              .
            </Step>
          </ol>
        </section>

        <section
          id="irs-help"
          className="rounded-lg border border-gray-200 bg-white p-5 space-y-3"
        >
          <h2 className="text-xl font-bold text-gray-900">IRS Notices &amp; Representation</h2>
          <p className="text-gray-700">
            For help with a notice or letter from the IRS, or for someone to
            deal with the IRS for you, such as in an audit, a payment or
            collection matter, or an appeal,{" "}
            <Link href={POST_IRS_HELP} className={link}>
              post in IRS Notices &amp; Representation
            </Link>
            . It works like a Tax Prep task: say what the IRS sent and which
            tax years it is about, without any of the numbers on it, and keep
            the notice itself out of the task and its messages.
          </p>
          <p className="text-gray-700">
            Only enrolled agents, CPAs and attorneys can take these tasks, once
            Gideon Tasks has recorded their credential and their PTIN for this
            calendar year. They are the only ones{" "}
            <a href={CIRCULAR_230_URL} className={link}>
              Circular 230 (31 CFR 10.3)
            </a>{" "}
            lets practice before the IRS without limit; the IRS calls these{" "}
            <a href={IRS_CREDENTIALS_URL} className={link}>
              unlimited representation rights
            </a>
            . Preparers: have your credential recorded along with your PTIN, as
            described above.
          </p>
          <p className="text-gray-700">
            To deal with the IRS for you, a representative needs your signed
            authorization on{" "}
            <a href={FORM_2848_URL} className={link}>
              Form 2848
            </a>
            . Bring the notice to an in-person session at a public place.
          </p>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Disputes and reporting</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>
              <strong className="text-gray-900">No contact details.</strong>{" "}
              Phone numbers, email addresses, social media handles and links
              are rejected in task posts, applications, questions and messages.
              Keep the conversation on Gideon Tasks: arranging a booking
              elsewhere gives up the escrow and the review history.
            </li>
            <li>
              <strong className="text-gray-900">Disputes.</strong> If the work
              was not done as agreed, do not approve it. Once the preparer marks
              the task done, you can open a dispute instead. An admin reviews
              it and either pays the preparer or refunds you.
            </li>
            <li>
              <strong className="text-gray-900">Reporting a problem.</strong>{" "}
              To report a preparer, a filer or a post, write to us through the{" "}
              <a href={CONTACT_URL} className={link}>
                Gideon Solutions contact page
              </a>
              . To report a paid preparer&apos;s misconduct to the IRS, see{" "}
              <a href={IRS_PREPARER_MISCONDUCT_URL} className={link}>
                tax return preparer misconduct
              </a>{" "}
              on irs.gov (Form 14157). If someone is in immediate danger, call
              911.
            </li>
          </ul>
        </section>
      </main>
      <Footer />
    </div>
  );
}
