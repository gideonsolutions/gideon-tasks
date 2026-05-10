import "server-only";
import Stripe from "stripe";
import { env } from "./env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (!cached) {
    cached = new Stripe(env.stripeSecretKey);
  }
  return cached;
}
