use gideon_tasks_api::models::payment::FeeBreakdown;

#[test]
fn test_100_dollar_task() {
    let b = FeeBreakdown::calculate(10_000); // $100.00
    assert_eq!(b.task_price_cents, 10_000);
    assert_eq!(b.gideon_fee_cents, 100); // 1% = $1.00
    assert_eq!(b.doer_payout_cents, 9_900); // $99.00

    // Verify total = task_price + gideon_fee + stripe_fee
    assert_eq!(
        b.total_charged_cents,
        b.task_price_cents + b.gideon_fee_cents + b.stripe_fee_cents
    );
}

#[test]
fn test_minimum_price_5_dollars() {
    let b = FeeBreakdown::calculate(500); // $5.00
    assert_eq!(b.task_price_cents, 500);
    assert_eq!(b.gideon_fee_cents, 5); // 1% = $0.05
    assert_eq!(b.doer_payout_cents, 495); // $4.95
}

#[test]
fn test_gideon_fee_is_exactly_1_percent_floor() {
    // $7.77 → 1% = 7.77 → floor = 7 cents
    let b = FeeBreakdown::calculate(777);
    assert_eq!(b.gideon_fee_cents, 7);
    assert_eq!(b.doer_payout_cents, 770);

    // $1.99 → 1% = 1.99 → floor = 1 cent (minimum realistic scenario)
    let b = FeeBreakdown::calculate(199);
    assert_eq!(b.gideon_fee_cents, 1);
    assert_eq!(b.doer_payout_cents, 198);

    // $99.99 → 1% = 99.99 → floor = 99 cents
    let b = FeeBreakdown::calculate(9_999);
    assert_eq!(b.gideon_fee_cents, 99);
    assert_eq!(b.doer_payout_cents, 9_900);
}

#[test]
fn test_fee_invariants_across_price_range() {
    // Test a wide range of prices
    for price in (500..=500_000).step_by(100) {
        let b = FeeBreakdown::calculate(price);

        // Invariant 1: doer_payout + gideon_fee = task_price
        assert_eq!(
            b.doer_payout_cents + b.gideon_fee_cents,
            b.task_price_cents,
            "Payout invariant violated at price={}",
            price
        );

        // Invariant 2: total_charged = task_price + gideon_fee + stripe_fee
        assert_eq!(
            b.total_charged_cents,
            b.task_price_cents + b.gideon_fee_cents + b.stripe_fee_cents,
            "Total invariant violated at price={}",
            price
        );

        // Invariant 3: gideon_fee = floor(task_price / 100)
        assert_eq!(
            b.gideon_fee_cents,
            price / 100,
            "Gideon fee invariant violated at price={}",
            price
        );

        // Invariant 4: all amounts are non-negative
        assert!(b.gideon_fee_cents >= 0, "Negative gideon_fee at price={}", price);
        assert!(b.stripe_fee_cents >= 0, "Negative stripe_fee at price={}", price);
        assert!(b.doer_payout_cents >= 0, "Negative doer_payout at price={}", price);
        assert!(
            b.total_charged_cents >= b.task_price_cents,
            "Total less than task_price at price={}",
            price
        );
    }
}

#[test]
fn test_maximum_task_price() {
    // $5,000 (max for Level 3)
    let b = FeeBreakdown::calculate(500_000);
    assert_eq!(b.gideon_fee_cents, 5_000); // $50.00
    assert_eq!(b.doer_payout_cents, 495_000); // $4,950.00
}

#[test]
fn test_stripe_fee_is_reasonable() {
    // For a $100 task, Stripe fee should be approximately 2.9% + $0.30
    let b = FeeBreakdown::calculate(10_000);
    // Expected: ~$3.33 (333 cents)
    // The fee should be between 300 and 400 cents for a $104 total
    assert!(
        b.stripe_fee_cents >= 300 && b.stripe_fee_cents <= 400,
        "Stripe fee {} seems unreasonable for $100 task",
        b.stripe_fee_cents
    );
}

#[test]
fn test_fee_amounts_as_i64() {
    // Ensure no overflow for max values
    let b = FeeBreakdown::calculate(500_000);
    assert!(b.total_charged_cents < i64::MAX);
    assert!(b.total_charged_cents > 0);
}
