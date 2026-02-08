use gideon_tasks_api::models::task::TaskStatus;

/// Test all valid transitions succeed.
#[test]
fn test_valid_transitions() {
    let valid = vec![
        (TaskStatus::Draft, TaskStatus::PendingReview),
        (TaskStatus::PendingReview, TaskStatus::Published),
        (TaskStatus::PendingReview, TaskStatus::Rejected),
        (TaskStatus::Published, TaskStatus::Assigned),
        (TaskStatus::Published, TaskStatus::Cancelled),
        (TaskStatus::Published, TaskStatus::Expired),
        (TaskStatus::Assigned, TaskStatus::InProgress),
        (TaskStatus::Assigned, TaskStatus::Cancelled),
        (TaskStatus::InProgress, TaskStatus::Submitted),
        (TaskStatus::Submitted, TaskStatus::Completed),
        (TaskStatus::Submitted, TaskStatus::Disputed),
        (TaskStatus::Disputed, TaskStatus::Resolved),
    ];

    for (from, to) in valid {
        let result = from.transition_to(to);
        assert!(
            result.is_ok(),
            "Expected valid transition from {:?} to {:?}, got error: {:?}",
            from,
            to,
            result.err()
        );
        assert_eq!(result.unwrap(), to);
    }
}

/// Test all invalid transitions fail.
#[test]
fn test_invalid_transitions() {
    let invalid = vec![
        // Can't skip states
        (TaskStatus::Draft, TaskStatus::Published),
        (TaskStatus::Draft, TaskStatus::Assigned),
        (TaskStatus::Draft, TaskStatus::Completed),
        // Can't go backwards
        (TaskStatus::Published, TaskStatus::Draft),
        (TaskStatus::Published, TaskStatus::PendingReview),
        (TaskStatus::Assigned, TaskStatus::Published),
        (TaskStatus::InProgress, TaskStatus::Assigned),
        (TaskStatus::Submitted, TaskStatus::InProgress),
        // Terminal states allow no transitions
        (TaskStatus::Completed, TaskStatus::Draft),
        (TaskStatus::Completed, TaskStatus::Published),
        (TaskStatus::Completed, TaskStatus::InProgress),
        (TaskStatus::Resolved, TaskStatus::Completed),
        (TaskStatus::Cancelled, TaskStatus::Published),
        (TaskStatus::Expired, TaskStatus::Published),
        (TaskStatus::Rejected, TaskStatus::Published),
        (TaskStatus::Rejected, TaskStatus::Draft),
        // Invalid cross-transitions
        (TaskStatus::Draft, TaskStatus::Completed),
        (TaskStatus::Published, TaskStatus::InProgress),
        (TaskStatus::Published, TaskStatus::Submitted),
        (TaskStatus::Published, TaskStatus::Completed),
        (TaskStatus::Assigned, TaskStatus::Submitted),
        (TaskStatus::Assigned, TaskStatus::Completed),
        (TaskStatus::InProgress, TaskStatus::Completed),
        (TaskStatus::InProgress, TaskStatus::Cancelled),
        (TaskStatus::Submitted, TaskStatus::Cancelled),
    ];

    for (from, to) in invalid {
        let result = from.transition_to(to);
        assert!(
            result.is_err(),
            "Expected invalid transition from {:?} to {:?}, but it succeeded",
            from,
            to
        );
    }
}

/// Test terminal states.
#[test]
fn test_terminal_states() {
    let terminal = vec![
        TaskStatus::Completed,
        TaskStatus::Resolved,
        TaskStatus::Cancelled,
        TaskStatus::Expired,
        TaskStatus::Rejected,
    ];

    for status in terminal {
        assert!(status.is_terminal(), "{:?} should be terminal", status);
    }

    let non_terminal = vec![
        TaskStatus::Draft,
        TaskStatus::PendingReview,
        TaskStatus::Published,
        TaskStatus::Assigned,
        TaskStatus::InProgress,
        TaskStatus::Submitted,
        TaskStatus::Disputed,
    ];

    for status in non_terminal {
        assert!(!status.is_terminal(), "{:?} should NOT be terminal", status);
    }
}

/// Test status string round-trip.
#[test]
fn test_status_round_trip() {
    let all = vec![
        TaskStatus::Draft,
        TaskStatus::PendingReview,
        TaskStatus::Published,
        TaskStatus::Assigned,
        TaskStatus::InProgress,
        TaskStatus::Submitted,
        TaskStatus::Completed,
        TaskStatus::Disputed,
        TaskStatus::Resolved,
        TaskStatus::Cancelled,
        TaskStatus::Expired,
        TaskStatus::Rejected,
    ];

    for status in all {
        let s = status.as_str();
        let parsed = TaskStatus::from_str(s);
        assert_eq!(
            parsed,
            Some(status),
            "Round-trip failed for {:?} -> {} -> {:?}",
            status,
            s,
            parsed
        );
    }
}

/// Test unknown status string returns None.
#[test]
fn test_unknown_status_returns_none() {
    assert_eq!(TaskStatus::from_str("unknown"), None);
    assert_eq!(TaskStatus::from_str(""), None);
    assert_eq!(TaskStatus::from_str("DRAFT"), None); // case sensitive
}
