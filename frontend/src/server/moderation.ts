export type ModerationResult =
  | { kind: "clean" }
  | { kind: "rejected"; reason: string }
  | { kind: "flagged"; reason: string };

const MINOR_PATTERNS: RegExp[] = [
  /\b(?:child|children|kid|kids|minor|minors|underage|under[\s-]?age)\b.*\b(?:care|sit|watch|babysit|nanny|tutor)/i,
  /\b(?:babysit|nanny|childcare|child[\s-]?care|daycare|day[\s-]?care)\b/i,
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

export function moderateContent(text: string): ModerationResult {
  for (const p of MINOR_PATTERNS) {
    if (p.test(text))
      return {
        kind: "rejected",
        reason: "Content references minors/children as task subjects",
      };
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
