//! Content moderation pipeline.
//!
//! Enforces safety rails from the MVP specification:
//!
//! - **Auto-rejected**: References to minors, sexually explicit language, contact
//!   information in task descriptions, GCOSL Section 4 prohibited uses.
//! - **Flagged for review**: Coded/ambiguous language, vague descriptions,
//!   suspicious pricing, new-account task posting.
//! - **Contact info stripping**: Phone numbers, emails, social handles, and URLs
//!   are replaced with `[removed]` in messages.

use once_cell::sync::Lazy;
use regex::Regex;

/// Content moderation result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModerationResult {
    /// Content is clean and can be published immediately.
    Clean,
    /// Content is auto-rejected with a reason. No manual review needed.
    Rejected(String),
    /// Content is flagged for manual review with a reason.
    Flagged(String),
}

// =============================================================================
// Auto-reject patterns (Section 4.1)
// =============================================================================

static MINOR_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?i)\b(?:child|children|kid|kids|minor|minors|underage|under[\s-]?age)\b.*\b(?:care|sit|watch|babysit|nanny|tutor)",
        r"(?i)\b(?:babysit|nanny|childcare|child[\s-]?care|daycare|day[\s-]?care)\b",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

static SEXUAL_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?i)\b(?:sex|sexual|erotic|nude|naked|porn|xxx|escort|massage.*happy|sensual)\b",
        r"(?i)\b(?:onlyfans|cam[\s-]?girl|cam[\s-]?boy|sugar[\s-]?daddy|sugar[\s-]?baby)\b",
        r"(?i)\b(?:hook[\s-]?up|friends[\s-]?with[\s-]?benefits|fwb|intimate[\s-]?services)\b",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

static CONTACT_INFO_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        // Phone numbers (various formats)
        r"\b\d{3}[\s.\-]?\d{3}[\s.\-]?\d{4}\b",
        r"\b\(\d{3}\)\s*\d{3}[\s.\-]?\d{4}\b",
        r"\+1[\s.\-]?\d{3}[\s.\-]?\d{3}[\s.\-]?\d{4}\b",
        // Email addresses
        r"(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}",
        // Social media handles
        r"(?i)\b(?:@[a-z0-9_]{3,})\b",
        r"(?i)\b(?:instagram|insta|ig|snapchat|snap|telegram|whatsapp|signal|discord|twitter|x\.com|tiktok|facebook|fb)\b[\s:]*[a-z0-9@_.]+",
        // URLs
        r"(?i)(?:https?://|www\.)[^\s]+",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

static PROHIBITED_USE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?i)\b(?:weapons?|guns?|firearms?|ammunition|ammo|explosives?|bombs?)\b",
        r"(?i)\b(?:sell|buy|deal|distribute|deliver)\b.*\b(?:drug|cocaine|heroin|meth|fentanyl|marijuana|weed|cannabis)\b",
        r"(?i)\b(?:drug|cocaine|heroin|meth|fentanyl|marijuana|weed|cannabis)\b.*\b(?:sell|buy|deal|distribute|deliver)\b",
        r"(?i)\b(?:gambl(?:e|ing)|casino|betting|wager)\b",
        r"(?i)\b(?:trafficking|smuggl(?:e|ing)|forced[\s-]?labor)\b",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

// =============================================================================
// Flagged patterns (Section 4.2) — queued for manual review
// =============================================================================

static CODED_LANGUAGE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?i)\b(?:party|partying|good[\s-]?time|discreet|discrete|private[\s-]?meeting)\b",
        r"(?i)\b(?:generous|arrangement|mutually[\s-]?beneficial|companionship)\b",
        r"(?i)\b(?:420|friendly|chill|open[\s-]?minded)\b",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

static VAGUE_DESCRIPTION_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?i)^.{0,20}$", // Very short descriptions (< 20 chars)
        r"(?i)\b(?:you[\s-]?know[\s-]?what|iykyk|wink|dm[\s-]?me|text[\s-]?me)\b",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

/// Run the full content moderation pipeline on text content.
/// Returns the most severe result (Rejected > Flagged > Clean).
pub fn moderate_content(text: &str) -> ModerationResult {
    // Auto-reject checks (most severe first)
    for pattern in MINOR_PATTERNS.iter() {
        if pattern.is_match(text) {
            return ModerationResult::Rejected(
                "Content references minors/children as task subjects".into(),
            );
        }
    }

    for pattern in SEXUAL_PATTERNS.iter() {
        if pattern.is_match(text) {
            return ModerationResult::Rejected("Sexually explicit content".into());
        }
    }

    for pattern in CONTACT_INFO_PATTERNS.iter() {
        if pattern.is_match(text) {
            return ModerationResult::Rejected(
                "Contact information not allowed in task descriptions".into(),
            );
        }
    }

    for pattern in PROHIBITED_USE_PATTERNS.iter() {
        if pattern.is_match(text) {
            return ModerationResult::Rejected("Content violates prohibited use policy".into());
        }
    }

    // Flag checks (queued for manual review)
    for pattern in CODED_LANGUAGE_PATTERNS.iter() {
        if pattern.is_match(text) {
            return ModerationResult::Flagged("Content contains potentially coded language".into());
        }
    }

    for pattern in VAGUE_DESCRIPTION_PATTERNS.iter() {
        if pattern.is_match(text) {
            return ModerationResult::Flagged("Content is vague or suspicious".into());
        }
    }

    ModerationResult::Clean
}

/// Strip contact information from text (used for messages where we want to
/// sanitize rather than reject).
pub fn strip_contact_info(text: &str) -> String {
    let mut result = text.to_string();
    for pattern in CONTACT_INFO_PATTERNS.iter() {
        result = pattern.replace_all(&result, "[removed]").to_string();
    }
    result
}

/// Check pricing for suspicious outliers.
#[allow(dead_code)]
pub fn check_price_suspicious(price_cents: i64, _category_slug: &str) -> Option<String> {
    // For MVP, flag very low or very high prices
    if price_cents < 500 {
        return Some("Price below minimum ($5.00)".into());
    }
    if price_cents > 500_000 {
        return Some("Unusually high price — flagged for review".into());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_content() {
        assert_eq!(
            moderate_content("I need someone to mow my lawn this Saturday"),
            ModerationResult::Clean
        );
    }

    #[test]
    fn test_rejects_minor_references() {
        assert!(matches!(
            moderate_content("Need someone to babysit my kids"),
            ModerationResult::Rejected(_)
        ));
        assert!(matches!(
            moderate_content("Looking for childcare services"),
            ModerationResult::Rejected(_)
        ));
    }

    #[test]
    fn test_rejects_sexual_content() {
        assert!(matches!(
            moderate_content("Looking for an escort for the evening"),
            ModerationResult::Rejected(_)
        ));
    }

    #[test]
    fn test_rejects_contact_info() {
        assert!(matches!(
            moderate_content("Call me at 555-123-4567"),
            ModerationResult::Rejected(_)
        ));
        assert!(matches!(
            moderate_content("Email me at test@example.com"),
            ModerationResult::Rejected(_)
        ));
        assert!(matches!(
            moderate_content("Check out https://example.com for details"),
            ModerationResult::Rejected(_)
        ));
    }

    #[test]
    fn test_rejects_prohibited_uses() {
        assert!(matches!(
            moderate_content("Need help to sell some weed"),
            ModerationResult::Rejected(_)
        ));
    }

    #[test]
    fn test_flags_coded_language() {
        assert!(matches!(
            moderate_content("Looking for a discreet arrangement"),
            ModerationResult::Flagged(_)
        ));
    }

    #[test]
    fn test_flags_vague_descriptions() {
        assert!(matches!(
            moderate_content("Help me please"),
            ModerationResult::Flagged(_)
        ));
    }

    #[test]
    fn test_strip_contact_info() {
        let result = strip_contact_info("Call me at 555-123-4567 or email test@example.com");
        assert!(!result.contains("555-123-4567"));
        assert!(!result.contains("test@example.com"));
        assert!(result.contains("[removed]"));
    }
}
