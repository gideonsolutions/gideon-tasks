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
 */
export function moderateContent(
  text: string,
  context?: ModerationContext,
): ModerationResult {
  for (const p of CHILDCARE_PATTERNS) {
    if (p.test(text))
      return {
        kind: "rejected",
        reason:
          "Childcare is not allowed: no babysitting, nanny work, daycare, or looking after children",
      };
  }
  if (!isGuardianTutoring(context)) {
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
