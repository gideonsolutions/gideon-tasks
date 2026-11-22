export type ModerationResult =
  | { kind: "clean" }
  | { kind: "rejected"; reason: string }
  | { kind: "flagged"; reason: string };

/** The Tutoring category's slug (see seed.ts). */
export const TUTORING_SLUG = "tutoring";

/**
 * Where a piece of content is posted. Task posts, applications, questions,
 * answers and messages pass their task's category and guardian flag.
 */
export interface ModerationContext {
  categorySlug?: string | null;
  /** The poster ticked "This is for my child under 18; I'm their parent or legal guardian". */
  forMinor?: boolean;
  /**
   * A Gideon Clerk booking description. Clerk is Gideon Solutions' own
   * paperwork service, done with the adult account holder and never a task,
   * so the two child rules (which keep childcare work and work on children
   * out of the task marketplace) don't apply: "help me apply for child care
   * assistance for my kids" is ordinary paperwork there. Every other rule does.
   */
  clerkBooking?: boolean;
}

/** A Tutoring task that a parent or guardian posted for their child. */
export function isGuardianTutoring(ctx?: ModerationContext): boolean {
  return ctx?.forMinor === true && ctx.categorySlug === TUTORING_SLUG;
}

const CHILD = String.raw`\b(?:child|children|kid|kids|minor|minors|underage|under[\s-]?age)\b`;
/** Up to two words between, e.g. "watch my two kids". */
const NEAR = String.raw`\s+(?:[\w'’]+\s+){0,2}`;

/**
 * Childcare: rejected in every post, including a guardian's tutoring post.
 */
const CHILDCARE_PATTERNS: RegExp[] = [
  /\b(?:babysit\w*|baby[\s-]sit\w*|nann(?:y|ies)|childcare|child[\s-]?care|daycare|day[\s-]?care)\b/i,
  // "watch my kids", "take care of the children", "look after my child"
  new RegExp(
    String.raw`\b(?:watch|watching|look(?:ing)? after|tak(?:e|ing) care of|car(?:e|ing) for|supervis(?:e|ing)|sit(?:ting)? with)` +
      NEAR +
      CHILD,
    "i",
  ),
  // "the kids need a sitter", "children needing supervision"; "a sitter for the kids"
  new RegExp(CHILD + NEAR + String.raw`(?:sitter|sitting|watching|supervision)\b`, "i"),
  new RegExp(String.raw`\bsitter` + NEAR + String.raw`(?:for\s+)?` + CHILD, "i"),
];

/**
 * A child as the subject of a post. Rejected everywhere except a Tutoring
 * task a parent or guardian posted for their child, and the applications,
 * questions, answers and messages on it.
 */
const MINOR_SUBJECT_PATTERNS: RegExp[] = [
  /\b(?:child|children|kid|kids|minor|minors|underage|under[\s-]?age)\b.*\b(?:care|sit|watch|babysit|nanny|tutor)/i,
  // Tutoring for a child, in either order and across lines.
  new RegExp(CHILD + String.raw`.*\btutor`, "is"),
  new RegExp(String.raw`\btutor.*` + CHILD, "is"),
];

/**
 * Social Security numbers and ITINs. An ITIN has the same nine-digit
 * ###-##-#### format as an SSN (it starts with 9), so one set of patterns
 * covers both. Rejected in every post, application, question, answer,
 * message and review, on every task: Gideon Tasks does not hold them.
 *
 * Kept narrow on purpose:
 * - unlabeled, only the dashed ###-##-#### form, not inside a longer run of
 *   digits and dashes (so phone numbers, ZIP+4 codes and dates don't match);
 * - any nine digits, with or without separators, next to a label: SSN, SS#,
 *   social security (number), ITIN, taxpayer identification number, or TIN
 *   (upper case, so the word "tin" doesn't count).
 * A bare nine-digit number with no label is not rejected, and neither is an
 * EIN in its ##-####### form.
 */
const DASH = String.raw`[-\u2010-\u2015]`;
/** Nine digits, optionally split 3-2-4 by dashes, dots or spaces. */
const NINE_DIGITS = String.raw`(?<!\d)\d{3}[-\u2010-\u2015. ]?\d{2}[-\u2010-\u2015. ]?\d{4}(?!\d)`;
const SSN_WORD = String.raw`\b(?:ssn\b|ss#|ss\s?no\b|soc(?:ial)?\.?\s*sec(?:urity)?\b|itin\b|taxpayer\s+identification\s+number\b)`;
/** Case-sensitive, so the word "tin" doesn't count. */
const TIN_WORD = String.raw`\bTIN\b`;
/** Up to 20 characters that aren't digits between the label and the number. */
const LABEL_GAP = String.raw`[^\d\n]{0,20}`;
const SSN_PATTERNS: RegExp[] = [
  new RegExp(String.raw`(?<![\d-])\d{3}(${DASH})\d{2}\1\d{4}(?![\d-])`),
  new RegExp(SSN_WORD + LABEL_GAP + NINE_DIGITS, "i"),
  new RegExp(NINE_DIGITS + LABEL_GAP + SSN_WORD, "i"),
  new RegExp(TIN_WORD + LABEL_GAP + NINE_DIGITS),
  new RegExp(NINE_DIGITS + LABEL_GAP + TIN_WORD),
];

export const SSN_REJECTION_REASON =
  "Social Security numbers and ITINs aren't allowed. Remove the number: never put an SSN, ITIN, tax documents or account numbers in a task, application, question or message";

/** Whether the text contains a Social Security number or ITIN (see SSN_PATTERNS). */
export function containsSsnOrItin(text: string): boolean {
  return SSN_PATTERNS.some((p) => p.test(text));
}

const SEXUAL_PATTERNS: RegExp[] = [
  /\b(?:sex|sexual|erotic|nude|naked|porn|xxx|escort|massage.*happy|sensual)\b/i,
  /\b(?:onlyfans|cam[\s-]?girl|cam[\s-]?boy|sugar[\s-]?daddy|sugar[\s-]?baby)\b/i,
  /\b(?:hook[\s-]?up|friends[\s-]?with[\s-]?benefits|fwb|intimate[\s-]?services)\b/i,
];

const CONTACT_INFO_PATTERNS: RegExp[] = [
  /\b\d{3}[\s.\-]?\d{3}[\s.\-]?\d{4}\b/,
  /\b\(\d{3}\)\s*\d{3}[\s.\-]?\d{4}\b/,
  /\+1[\s.\-]?\d{3}[\s.\-]?\d{3}[\s.\-]?\d{4}\b/,
  /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i,
  /\b@[a-z0-9_]{3,}\b/i,
  /\b(?:instagram|insta|ig|snapchat|snap|telegram|whatsapp|signal|discord|twitter|x\.com|tiktok|facebook|fb)\b[\s:]*[a-z0-9@_.]+/i,
  /(?:https?:\/\/|www\.)\S+/i,
];

const PROHIBITED_USE_PATTERNS: RegExp[] = [
  /\b(?:weapons?|guns?|firearms?|ammunition|ammo|explosives?|bombs?)\b/i,
  /\b(?:sell|buy|deal|distribute|deliver)\b.*\b(?:drug|cocaine|heroin|meth|fentanyl|marijuana|weed|cannabis)\b/i,
  /\b(?:drug|cocaine|heroin|meth|fentanyl|marijuana|weed|cannabis)\b.*\b(?:sell|buy|deal|distribute|deliver)\b/i,
  /\b(?:gambl(?:e|ing)|casino|betting|wager)\b/i,
  /\b(?:trafficking|smuggl(?:e|ing)|forced[\s-]?labor)\b/i,
];

const CODED_LANGUAGE_PATTERNS: RegExp[] = [
  /\b(?:party|partying|good[\s-]?time|discreet|discrete|private[\s-]?meeting)\b/i,
  /\b(?:generous|arrangement|mutually[\s-]?beneficial|companionship)\b/i,
  /\b(?:420|friendly|chill|open[\s-]?minded)\b/i,
];

const VAGUE_DESCRIPTION_PATTERNS: RegExp[] = [
  /^.{0,20}$/,
  /\b(?:you[\s-]?know[\s-]?what|iykyk|wink|dm[\s-]?me|text[\s-]?me)\b/i,
];

/**
 * Checks content before it is posted. `context` is the task the content
 * belongs to: in a Tutoring task that a parent or guardian posted for their
 * child, content may mention the child; childcare is rejected everywhere.
 * Social Security numbers and ITINs are rejected everywhere, first.
 */
export function moderateContent(
  text: string,
  context?: ModerationContext,
): ModerationResult {
  if (containsSsnOrItin(text)) return { kind: "rejected", reason: SSN_REJECTION_REASON };
  const clerk = context?.clerkBooking === true;
  for (const p of clerk ? [] : CHILDCARE_PATTERNS) {
    if (p.test(text))
      return {
        kind: "rejected",
        reason:
          "Childcare is not allowed: no babysitting, nanny work, daycare, or looking after children",
      };
  }
  if (!clerk && !isGuardianTutoring(context)) {
    for (const p of MINOR_SUBJECT_PATTERNS) {
      if (p.test(text))
        return {
          kind: "rejected",
          reason:
            "Content references minors/children as task subjects. A parent or guardian can ask for tutoring for their child: post in Tutoring and tick the box saying it is for your child",
        };
    }
  }
  for (const p of SEXUAL_PATTERNS) {
    if (p.test(text))
      return { kind: "rejected", reason: "Sexually explicit content" };
  }
  for (const p of CONTACT_INFO_PATTERNS) {
    if (p.test(text))
      return {
        kind: "rejected",
        reason: "Contact information not allowed in task descriptions",
      };
  }
  for (const p of PROHIBITED_USE_PATTERNS) {
    if (p.test(text))
      return {
        kind: "rejected",
        reason: "Content violates prohibited use policy",
      };
  }
  for (const p of CODED_LANGUAGE_PATTERNS) {
    if (p.test(text))
      return {
        kind: "flagged",
        reason: "Content contains potentially coded language",
      };
  }
  for (const p of VAGUE_DESCRIPTION_PATTERNS) {
    if (p.test(text))
      return { kind: "flagged", reason: "Content is vague or suspicious" };
  }
  return { kind: "clean" };
}

export function stripContactInfo(text: string): string {
  let result = text;
  for (const p of CONTACT_INFO_PATTERNS) {
    result = result.replace(new RegExp(p.source, p.flags + "g"), "[removed]");
  }
  return result;
}
