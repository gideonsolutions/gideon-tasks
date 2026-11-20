import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Loads Stripe.js once, on first use in the browser (loadStripe must not run
 * on every render). Resolves to null when no publishable key is configured.
 */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return Promise.resolve(null);
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

export function formatCardBrand(brand: string): string {
  const names: Record<string, string> = {
    amex: "American Express",
    diners: "Diners Club",
    discover: "Discover",
    jcb: "JCB",
    mastercard: "Mastercard",
    unionpay: "UnionPay",
    visa: "Visa",
  };
  return names[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}
