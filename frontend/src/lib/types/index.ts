// All TypeScript interfaces matching backend Rust models

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
  stripe_connect_account_id: string | null;
  id_verified_at: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicUserProfile {
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
  status: TaskStatus;
  deadline: string;
  assigned_doer_id: string | null;
  moderation_note: string | null;
  rejection_reason: string | null;
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
  deadline: string;
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
  deadline?: string;
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

export interface FeeBreakdown {
  task_price_cents: number;
  gideon_fee_cents: number;
  doer_payout_cents: number;
  stripe_fee_cents: number;
  total_charged_cents: number;
}

// ─── Application ─────────────────────────────────────────

export interface TaskApplication {
  id: string;
  task_id: string;
  doer_id: string;
  message: string | null;
  status: string;
  created_at: string;
}

export interface CreateApplicationRequest {
  message?: string;
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
  invite_code: string;
  legal_first_name: string;
  legal_last_name: string;
  email: string;
  phone: string;
  password: string;
}

export interface RegisterResponse {
  user_id: string;
  message: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface VerifyEmailRequest {
  code: string;
}

export interface VerifyPhoneRequest {
  code: string;
}

// ─── Stripe Connect ──────────────────────────────────────

export interface StripeConnectResponse {
  url: string;
}

export interface StripeConnectStatus {
  charges_enabled: boolean;
  payouts_enabled: boolean;
}

// ─── API Error ───────────────────────────────────────────

export interface ApiError {
  error: string;
  status: number;
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
