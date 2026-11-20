import { z } from "zod";

/**
 * Body of POST /api/auth/register. The invite code is optional: a blank or
 * missing code means an open sign-up that must confirm its email by link.
 */
export const RegisterSchema = z.object({
  invite_code: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .transform((code) => (code ? code : null)),
  legal_first_name: z.string().min(1).max(100),
  legal_last_name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  phone: z.string().min(1).max(32),
  password: z.string().min(8).max(200),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
