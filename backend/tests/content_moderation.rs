use gideon_tasks_api::services::moderation::{ModerationResult, moderate_content, strip_contact_info};

// =============================================================================
// Auto-rejection tests (Section 4.1)
// =============================================================================

#[test]
fn test_rejects_childcare_references() {
    let cases = vec![
        "Need someone to babysit my kids",
        "Looking for childcare services",
        "Nanny needed for two children",
        "My child needs care while I'm at work",
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Rejected(_)),
            "Expected rejection for: '{}'",
            case
        );
    }
}

#[test]
fn test_rejects_sexual_content() {
    let cases = vec![
        "Looking for an escort for the evening",
        "Need someone for sensual massage",
        "Sugar daddy looking for arrangement",
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Rejected(_)),
            "Expected rejection for: '{}'",
            case
        );
    }
}

#[test]
fn test_rejects_contact_info_phone() {
    let cases = vec![
        "Call me at 555-123-4567",
        "My number is 555 123 4567",
        "Text me at +1-555-123-4567",
        "Reach out: 555.123.4567",
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Rejected(_)),
            "Expected rejection for phone: '{}'",
            case
        );
    }
}

#[test]
fn test_rejects_contact_info_email() {
    let cases = vec![
        "Email me at john@example.com",
        "Send details to test@gmail.com",
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Rejected(_)),
            "Expected rejection for email: '{}'",
            case
        );
    }
}

#[test]
fn test_rejects_contact_info_urls() {
    let cases = vec![
        "Check out https://example.com for details",
        "Visit www.example.com",
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Rejected(_)),
            "Expected rejection for URL: '{}'",
            case
        );
    }
}

#[test]
fn test_rejects_prohibited_uses() {
    let cases = vec![
        "Need help to sell some weed",
        "I want to buy some cocaine",
        "Help with weapons manufacturing",
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Rejected(_)),
            "Expected rejection for prohibited use: '{}'",
            case
        );
    }
}

// =============================================================================
// Flagged for review tests (Section 4.2)
// =============================================================================

#[test]
fn test_flags_coded_language() {
    let cases = vec![
        "Looking for a discreet arrangement",
        "Generous gentleman seeking companionship",
        "Open minded and 420 friendly",
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Flagged(_)),
            "Expected flagged for: '{}'",
            case
        );
    }
}

#[test]
fn test_flags_vague_descriptions() {
    let cases = vec![
        "Help me please", // Very short
        "Need help",      // Very short
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Flagged(_)),
            "Expected flagged for vague: '{}'",
            case
        );
    }
}

// =============================================================================
// Clean content tests
// =============================================================================

#[test]
fn test_allows_normal_task_descriptions() {
    let cases = vec![
        "I need someone to mow my lawn this Saturday morning in Charlotte",
        "Looking for a handyman to fix a leaky faucet in my kitchen sink",
        "Help me move furniture from my apartment to a storage unit downtown",
        "Need a graphic designer to create a logo for my small business",
        "Professional house cleaning needed for a three bedroom home",
        "Help assembling IKEA furniture - bookshelf and desk",
        "Need someone to paint the exterior of my garden fence",
        "Dog walking needed Monday through Friday while I am at work",
    ];
    for case in cases {
        assert!(
            matches!(moderate_content(case), ModerationResult::Clean),
            "Expected clean for: '{}', got: {:?}",
            case,
            moderate_content(case)
        );
    }
}

// =============================================================================
// Contact info stripping tests
// =============================================================================

#[test]
fn test_strips_phone_numbers() {
    let result = strip_contact_info("Call me at 555-123-4567 for details");
    assert!(!result.contains("555-123-4567"));
    assert!(result.contains("[removed]"));
}

#[test]
fn test_strips_email_addresses() {
    let result = strip_contact_info("Email me at john@example.com please");
    assert!(!result.contains("john@example.com"));
    assert!(result.contains("[removed]"));
}

#[test]
fn test_strips_urls() {
    let result = strip_contact_info("See https://example.com for more info");
    assert!(!result.contains("https://example.com"));
    assert!(result.contains("[removed]"));
}

#[test]
fn test_preserves_clean_text() {
    let input = "I need help moving furniture on Saturday";
    let result = strip_contact_info(input);
    assert_eq!(result, input);
}
