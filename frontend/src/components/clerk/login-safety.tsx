import { clerkLoginSafety } from "@/server/clerk-rules";

/**
 * Gideon Clerk's login-safety rules, shown in full on the Gideon Clerk page
 * and in the booking form. Tech-support scams ask for exactly these things,
 * so the box also says what to do when someone does.
 */
export function ClerkLoginSafety({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      aria-labelledby="clerk-login-safety"
      className="rounded-lg border-2 border-blue-300 bg-blue-50 p-5 space-y-3"
    >
      <Heading id="clerk-login-safety" className="text-xl font-bold text-gray-900">
        Your logins stay yours
      </Heading>
      <ul className="list-disc pl-5 space-y-2 text-gray-900">
        {clerkLoginSafety().map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <p className="text-gray-900">
        If anyone says they are from Gideon Clerk and asks for any of these,
        it isn&apos;t us. Stop, don&apos;t pay, and check your bookings by
        signing in to Gideon Tasks yourself.
      </p>
    </section>
  );
}
