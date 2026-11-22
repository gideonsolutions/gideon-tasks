// All TypeScript interfaces matching backend Rust models

import type { PreparerBadges, TaxCredential } from "@/server/tax-preparers";
import type { DocumentContentType, ProofKind } from "@/server/documents/rules";

export type { PreparerBadges, TaxCredential, DocumentContentType, ProofKind };

// ─── Enums ───────────────────────────────────────────────

export type TaskStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "completed"
  | "disputed"
  | "resolved"
  | "cancelled"
  | "expired"
  | "rejected";

export type PaymentStatus =
  | "pending"
  | "escrowed"
  | "released"
  | "refunded"
  | "failed";

export type UserStatus = "active" | "suspended" | "banned";

export type LocationType = "in_person" | "remote";

export type PricingMode = "doer_receives" | "requester_pays";

export type AttestorType = "church" | "nonprofit" | "organization";

export type ModerationAction = "approved" | "rejected" | "flagged" | "escalated";

export type ModerationEntityType = "task" | "message" | "review" | "user";

// ─── User ────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  phone: string;
  legal_first_name: string;
  legal_last_name: string;
  trust_level: number;
  status: UserStatus;
  email_verified: boolean;
  phone_verified: boolean;
  stripe_customer_id: string | null;
  /** The saved card used for bookings (a Stripe PaymentMethod ID). */
  stripe_payment_method_id: string | null;
  stripe_connect_account_id: string | null;
  id_verified_at: string | null;
  /** When an admin recorded a cleared background check; null if none. */
  background_check_cleared_at: string | null;
  /** Whether an admin has recorded a PTIN (the PTIN itself is for admins). */
  has_ptin: boolean;
  /** When two-step sign-in was turned on; null if it is off. */
  totp_enabled_at: string | null;
  /** The calendar year the recorded PTIN was verified for. */
  ptin_year: number | null;
  /** The credential an admin recorded, shown as a badge. */
  tax_credential: TaxCredential | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

/** What /admin/users shows and changes about a user's background check. */
export interface BackgroundCheckRecord {
  id: string;
  legal_first_name: string;
  legal_last_name: string;
  email: string;
  status: UserStatus;
  background_check_cleared_at: string | null;
  background_check_note: string | null;
}

export type BackgroundCheckChange =
  | { action: "record"; note: string; confirms_identity_and_adult: true }
  | { action: "clear"; note: string };

/** What /admin/users shows and changes about a user as a tax preparer. */
export interface TaxPreparerRecord {
  id: string;
  legal_first_name: string;
  legal_last_name: string;
  email: string;
  status: UserStatus;
  ptin: string | null;
  ptin_year: number | null;
  ptin_note: string | null;
  ptin_recorded_at: string | null;
  ptin_recorded_by: string | null;
  tax_credential: TaxCredential | null;
  tax_credential_note: string | null;
  tax_credential_recorded_at: string | null;
  tax_credential_recorded_by: string | null;
  /** The calendar year (UTC). */
  current_year: number;
  /** The years a PTIN can be recorded for now: this year, and next year from December 1. */
  recordable_years: number[];
}

export type TaxPreparerChange =
  | {
      action: "record_ptin";
      ptin: string;
      year: number;
      note: string;
      confirms_current_ptin: true;
      /** Required for next year's PTIN. */
      confirms_renewal_active_this_year?: true;
      /** Recording from the review queue: the proof document to mark approved. */
      proof_id?: string;
    }
  | { action: "clear_ptin"; note: string }
  | {
      action: "record_credential";
      credential: TaxCredential;
      note: string;
      confirms_credential: true;
      proof_id?: string;
    }
  | { action: "clear_credential"; note: string };

/** A public profile, with the credential and current-year PTIN badges (never the PTIN). */
export interface PublicUserProfile extends PreparerBadges {
  id: string;
  legal_first_name: string;
  trust_level: number;
  created_at: string;
}

// ─── Task ────────────────────────────────────────────────

export interface Task {
  id: string;
  requester_id: string;
  title: string;
  description: string;
  category_id: string;
  location_type: LocationType;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  price_cents: number;
  pricing_mode: PricingMode;
  status: TaskStatus;
  deadline: string;
  assigned_doer_id: string | null;
  moderation_note: string | null;
  rejection_reason: string | null;
  /** Tutoring a parent or legal guardian posted for their child under 18. */
  for_minor: boolean;
  /** The category's slug (on a single task from GET /tasks/[id]). */
  category_slug?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  category_id: string;
  location_type: LocationType;
  location_address?: string;
  location_lat?: number;
  location_lng?: number;
  price_cents: number;
  pricing_mode?: PricingMode;
  deadline: string;
  /** "This is for my child under 18; I'm their parent or legal guardian" (Tutoring only). */
  for_minor?: boolean;
  /** Required for an in-person task for a child: the address is a public place. */
  public_place_confirmed?: boolean;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  category_id?: string;
  location_type?: LocationType;
  location_address?: string;
  location_lat?: number;
  location_lng?: number;
  price_cents?: number;
  pricing_mode?: PricingMode;
  deadline?: string;
  for_minor?: boolean;
  public_place_confirmed?: boolean;
}

export interface FeeBreakdown {
  anchor_cents: number;
  total_charged_cents: number;
  stripe_fee_cents: number;
  gideon_fee_cents: number;
  doer_payout_cents: number;
}

// ─── Payment ─────────────────────────────────────────────

export interface Payment {
  id: string;
  task_id: string;
  requester_id: string;
  doer_id: string;
  task_price_cents: number;
  gideon_fee_cents: number;
  stripe_fee_cents: number;
  total_charged_cents: number;
  doer_payout_cents: number;
  stripe_payment_intent_id: string;
  stripe_transfer_id: string | null;
  status: PaymentStatus;
  escrowed_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

// ─── Application ─────────────────────────────────────────

export interface TaskApplication {
  id: string;
  task_id: string;
  doer_id: string;
  message: string | null;
  status: string;
  created_at: string;
  /** The applicant's credential and current-year PTIN badges (in the requester's list). */
  doer_badges?: PreparerBadges;
}

export interface CreateApplicationRequest {
  message?: string;
}

// ─── Question ────────────────────────────────────────────

export interface TaskQuestion {
  id: string;
  task_id: string;
  asker_id: string;
  question_body: string;
  answer_body: string | null;
  answered_by_id: string | null;
  answered_at: string | null;
  created_at: string;
}

// ─── Message ─────────────────────────────────────────────

export interface TaskMessage {
  id: string;
  task_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface CreateMessageRequest {
  body: string;
}

// ─── Review ──────────────────────────────────────────────

export interface Review {
  id: string;
  task_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reliability: number;
  quality: number;
  communication: number;
  integrity: number;
  comment: string | null;
  created_at: string;
}

export interface CreateReviewRequest {
  reliability: number;
  quality: number;
  communication: number;
  integrity: number;
  comment?: string;
}

// ─── Reputation ──────────────────────────────────────────

export interface ReputationSummary {
  user_id: string;
  total_completed: number;
  completion_rate: number;
  on_time_rate: number;
  avg_reliability: number;
  avg_quality: number;
  avg_communication: number;
  avg_integrity: number;
  disputes_lost: number;
  positive_review_rate: number;
  updated_at: string;
}

// ─── Invite ──────────────────────────────────────────────

export interface Invite {
  id: string;
  attestor_id: string;
  code: string;
  target_email: string | null;
  claimed_by: string | null;
  expires_at: string;
  created_at: string;
}

export interface CreateInviteRequest {
  target_email?: string;
  count?: number;
}

// ─── Attestation ─────────────────────────────────────────

export interface Attestation {
  id: string;
  attestor_id: string;
  user_id: string;
  status: string;
  confirmed_at: string | null;
  created_at: string;
}

export interface Attestor {
  id: string;
  name: string;
  type: AttestorType;
  status: string;
  invite_quota: number;
  contact_email: string | null;
  created_at: string;
}

// ─── Category ────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_active: boolean;
}

// ─── Audit Log ───────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  created_at: string;
}

// ─── Moderation ──────────────────────────────────────────

export interface ModerationLogEntry {
  id: string;
  entity_type: ModerationEntityType;
  entity_id: string;
  action: ModerationAction;
  reason: string | null;
  moderator_id: string | null;
  created_at: string;
}

// ─── Auth ────────────────────────────────────────────────

export interface RegisterRequest {
  /** Optional: an invite lets an attestor vouch for the new account. */
  invite_code?: string;
  legal_first_name: string;
  legal_last_name: string;
  email: string;
  phone: string;
  password: string;
}

export interface RegisterResponse {
  user_id: string;
  message: string;
  /** True for sign-ups without an invite: the email must be confirmed by link. */
  email_verification_required: boolean;
  verification_email_sent: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginSession {
  access_token: string;
  refresh_token: string;
  user: User;
  /** After signing in with a recovery code: how many are left. */
  recovery_codes_left?: number;
}

/** The password was right, and the account has two-step sign-in: a code is next. */
export interface LoginTwoStepRequired {
  two_step_required: true;
  /** A 5-minute token for /auth/login/two-step; not a session. */
  pending_token: string;
  expires_in: number;
}

export type LoginResponse = LoginSession | LoginTwoStepRequired;

export interface TwoStepLoginRequest {
  pending_token: string;
  code: string;
}

export interface TwoStepStatus {
  /** The server can encrypt secrets (MFA_ENCRYPTION_KEY is set). */
  available: boolean;
  enabled: boolean;
  enabled_at: string | null;
  setup_in_progress: boolean;
  recovery_codes_left: number;
  /** This session passed two-step sign-in. */
  session_verified: boolean;
}

export interface TwoStepSetup {
  /** The secret, grouped for typing into an app. */
  key: string;
  otpauth_uri: string;
  qr_svg: string;
}

export interface TwoStepAdminView {
  id: string;
  email: string;
  legal_first_name: string;
  legal_last_name: string;
  status: UserStatus;
  enabled: boolean;
  enabled_at: string | null;
  failures: number;
  locked_until: string | null;
  recovery_codes_left: number;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface VerifyEmailResponse {
  message: string;
  already_verified: boolean;
}

export interface ResendVerificationResponse {
  message: string;
  already_verified: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface MessageResponse {
  message: string;
}

export interface VerifyPhoneRequest {
  code: string;
}

// ─── Stripe Connect ──────────────────────────────────────

export interface StripeConnectResponse {
  url: string;
}

export interface StripeConnectStatus {
  connected: boolean;
  details_submitted: boolean;
  /** The account can receive transfers from Gideon Tasks. */
  transfers_active: boolean;
  payouts_enabled: boolean;
  /** Transfers and payouts both work: the doer can start tasks and be paid. */
  ready: boolean;
  /** Stripe still needs information: send the doer back through onboarding. */
  needs_more_info: boolean;
  /** Doer accounts only request transfers, so this is normally false. */
  charges_enabled: boolean;
}

// ─── Payments ────────────────────────────────────────────

export interface SavedCard {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

export type AssignTaskResponse =
  | { status: "assigned"; message: string }
  | {
      status: "requires_action";
      message: string;
      /** Pass to stripe.handleNextAction, then call assign again. */
      payment_client_secret: string;
      payment_intent_id: string;
    };

// ─── API Error ───────────────────────────────────────────

export interface ApiError {
  error: string;
  status: number;
  /** "two_step_required": set up, or sign in again with, two-step sign-in. */
  code?: string;
}

// ─── Pagination ──────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ─── JWT Claims (decoded) ────────────────────────────────

export interface JwtClaims {
  sub: string;
  is_admin: boolean;
  trust_level: number;
  exp: number;
  iat: number;
}

// ─── Documents ───────────────────────────────────────────

export interface DocumentsConfig {
  /** False when document storage isn't set up: the pages hide it. */
  enabled: boolean;
  content_types: DocumentContentType[];
  accept: string;
  max_file_bytes: number;
  max_files_per_task: number;
  task_retention_days: number;
  proof_retention_days: number;
}

/** What the server returns when an upload starts: a token for one pathname. */
export interface UploadStart {
  pathname: string;
  content_type: DocumentContentType;
  client_token: string;
  valid_until: string;
}

export interface TaskDocument {
  id: string;
  task_id: string;
  uploader_id: string;
  display_name: string | null;
  content_type: DocumentContentType;
  size_bytes: number | null;
  uploaded_at: string | null;
  /** Uploaded by the signed-in user (who alone can delete it). */
  mine: boolean;
}

export interface TaskDocumentList {
  documents: TaskDocument[];
  access: "participant" | "admin_dispute";
  /** When the files will be deleted, once the task is closed. */
  delete_after: string | null;
  can_upload: boolean;
}

export type ProofStatus = "uploading" | "pending" | "approved" | "rejected" | "withdrawn" | "abandoned";

export interface PreparerProof {
  id: string;
  kind: ProofKind;
  display_name: string | null;
  content_type: DocumentContentType;
  size_bytes: number | null;
  status: ProofStatus;
  /** On a rejection: the admin's note to the tasker. */
  review_note: string | null;
  reviewed_at: string | null;
  uploaded_at: string | null;
  file_deleted: boolean;
  delete_after: string | null;
}

export interface ProofQueueItem extends PreparerProof {
  user: {
    id: string;
    legal_first_name: string;
    legal_last_name: string;
    email: string;
    status: UserStatus;
    ptin_year: number | null;
    tax_credential: TaxCredential | null;
  };
}

export interface ProofQueue {
  current_year: number;
  recordable_years: number[];
  proofs: ProofQueueItem[];
}
