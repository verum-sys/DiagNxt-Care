export type SyncStatus = 'pending' | 'synced';
export type Sex = 'F' | 'M' | 'O';
export type Urgency = 'routine' | 'soon' | 'urgent';
export type Intention = 'will_attend' | 'unsure' | 'will_not_attend';
export type FacilityResponse = 'none' | 'received' | 'accepted' | 'declined' | 'info_requested';
export type Attendance = 'unknown' | 'attended' | 'not_attended';

export interface Patient {
  id: string; // human-readable, e.g. CL-0001
  name: string;
  age?: number;
  sex?: Sex;
  phone?: string;
  locality?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export type AppointmentCertainty = 'confirmed' | 'tentative';

/** Facts the frontline worker learned themselves (phone call, home visit). Owned by the frontline device. */
export interface WorkerFacts {
  facilityResponse?: FacilityResponse;
  appointmentDate?: string;
  appointmentCertainty?: AppointmentCertainty;
  attendance?: Attendance;
  outcomeRecorded?: boolean;
  outcomeNote?: string;
}

export interface FacilityNote {
  at: string;
  text: string;
}

/** Facts confirmed by the receiving facility. Owned by the facility; pulled to the field on sync. */
export interface FacilityFacts {
  response: FacilityResponse;
  appointmentDate?: string;
  attendance: Attendance;
  completed: boolean;
  followUpRequired: boolean;
  followUpPlan?: string;
  notes: FacilityNote[];
  updatedAt?: string;
}

export interface Referral {
  id: string;
  patientId: string;
  referringWorker: string;
  reason: string;
  destinationFacility: string;
  referralDate: string; // yyyy-mm-dd
  urgency: Urgency;
  notes: string;
  patientIntention?: Intention;
  screening?: ScreeningInfo;
  worker: WorkerFacts;
  facility: FacilityFacts;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
}

export type FollowUpAction =
  | 'contacted_patient'
  | 'unable_to_reach'
  | 'appointment_confirmed'
  | 'rescheduled'
  | 'facility_contacted'
  | 'info_sent_to_facility'
  | 'patient_attended'
  | 'patient_not_attended'
  | 'outcome_recorded'
  | 'referral_sent'
  | 'details_completed'
  | 'other';

export interface FollowUp {
  id: string;
  referralId: string;
  at: string;
  action: FollowUpAction;
  note?: string;
  data?: { date?: string; response?: FacilityResponse; intention?: Intention };
  /** The action key the Small AI suggested at the time; lets the timeline show worker overrides. */
  suggestedAction?: ActionKey;
  syncStatus: SyncStatus;
}

export interface SyncEvent {
  id: string;
  at: string;
  direction: 'push' | 'pull';
  summary: string;
  referralIds: string[];
}

export interface OutboxItem {
  id: string;
  entity: 'patient' | 'referral' | 'followup';
  entityId: string;
  at: string;
}

/** Facility-side events recorded on the (simulated) server, shown in timelines after sync. */
export interface FacilityEvent {
  id: string;
  referralId: string;
  at: string;
  kind: 'acknowledged' | 'accepted' | 'declined' | 'info_requested' | 'scheduled' | 'attended' | 'not_attended' | 'completed' | 'note';
  text?: string;
}

// ---------- Case stage (briefing workflow; distinct from CareStateKey until UI merge) ----------

export type CaseStageKey =
  | 'initial_assessment'
  | 'initial_care_no_referral'
  | 'referral_initiated'
  | 'referral_accepted'
  | 'appointment_scheduled'
  | 'follow_up_due'
  | 'completed';

export type FieldDisplayStatus =
  | 'known'
  | 'tentative'
  | 'pending'
  | 'unknown'
  | 'not_applicable'
  | 'completed'
  | 'missed'
  | 'not_assessed';

export type ReferralDecision = 'referred' | 'none';

export type ScreeningArea = 'oral' | 'breast' | 'cervical' | 'ncd';
export type ScreeningFinding = 'positive' | 'negative' | 'needs_review';
export type ReferralRequiredAnswer = 'yes' | 'no';

/** Frontline screening at first contact (before or alongside referral). */
export interface ScreeningInfo {
  completed: boolean;
  area?: ScreeningArea;
  finding?: ScreeningFinding;
  referralRequired?: ReferralRequiredAnswer;
}

export type DraftFieldKey =
  | 'caseStage'
  | 'referralDecision'
  | 'screeningCompleted'
  | 'screeningArea'
  | 'screeningFinding'
  | 'referralRequired'
  | 'name'
  | 'age'
  | 'phone'
  | 'locality'
  | 'reason'
  | 'destinationFacility'
  | 'referralDate'
  | 'urgency'
  | 'facilityResponse'
  | 'appointmentDate'
  | 'attendance'
  | 'patientIntention';

export interface DraftFieldRow {
  key: DraftFieldKey;
  labelKey: string;
  displayValue?: string;
  displayValueKey?: string;
  status: FieldDisplayStatus;
}

export interface StageExpectations {
  complete: DraftFieldKey[];
  pending: DraftFieldKey[];
  notApplicable: DraftFieldKey[];
}

// ---------- Intelligence ----------

export type CareStateKey =
  | 'incomplete'
  | 'not_sent'
  | 'awaiting_facility'
  | 'info_requested'
  | 'declined'
  | 'accepted_no_appt'
  | 'scheduled'
  | 'appt_passed_unknown'
  | 'not_attended'
  | 'attended_outcome_unknown'
  | 'follow_up_required'
  | 'closed';

export type FactState = 'known' | 'unknown' | 'missing' | 'na';
export type FactSource = 'facility' | 'worker' | 'patient';

export interface FactRow {
  key: string; // i18n key under fact.*
  value?: string; // display value (already a key or raw text; see valueKey)
  valueKey?: string; // i18n key for the value, preferred over value
  state: FactState;
  source?: FactSource;
}

export type ActionKey =
  | 'complete_details'
  | 'send_referral'
  | 'confirm_referral'
  | 'send_info'
  | 'find_alternative'
  | 'confirm_appointment'
  | 'remind_patient'
  | 'check_attendance'
  | 'visit_home'
  | 'reschedule'
  | 'record_outcome'
  | 'plan_follow_up'
  | 'resolve_conflict'
  | 'none';

export interface Issue {
  key: string; // i18n key under issue.*
  params?: Record<string, string | number>;
}

export interface Intelligence {
  careState: CareStateKey;
  facts: FactRow[];
  missing: Issue[];
  unresolved: Issue[];
  contradictions: Issue[];
  action: ActionKey;
  reason: Issue;
  priority: number;
  /** Days until (negative = overdue) the next relevant date, if any. */
  dueInDays?: number;
  open: boolean;
}
