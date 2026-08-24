# System Design — Healthcare Appointment & Follow-up Manager

## 1. Architecture

CareFlow uses a Next.js application containing the frontend and REST-style backend route handlers. PostgreSQL stores users, doctor profiles, leave periods, appointments, symptom forms, AI summaries, post-visit notes, notifications, calendar operations and medication reminders. Prisma provides typed database access.

Authentication is role-based. Patients can register themselves; doctor and admin accounts are created by the admin/seed process. A signed HTTP-only session cookie identifies the user. API handlers enforce the required role before accessing protected resources.

## 2. Double-booking prevention

A slot is never trusted just because the UI displayed it as available. At booking time, the backend validates the doctor's working hours and leave calendar and checks overlapping active appointments. The check and appointment creation happen inside a PostgreSQL `Serializable` transaction. This prevents two concurrent transactions from both successfully reserving the same slot. A PostgreSQL transaction-scoped advisory lock derived from doctor and start time serializes simultaneous attempts for the same slot. This avoids the stale-row problem a plain unique constraint would create when an expired pending hold has not yet been cleaned up. If the database reports a conflict, the API returns HTTP 409 and the patient must choose another slot.

The final confirmation step performs another conflict check. Therefore, even if a patient keeps a slot page open while another patient books the same time, confirmation cannot silently create a duplicate confirmed appointment.

## 3. Slot hold mechanism

After the patient selects a slot and submits symptoms, the system creates a `PENDING` appointment with a five-minute `holdExpiresAt`. This temporarily reserves the slot while the pre-visit summary is generated and the patient confirms. Expired pending appointments are converted to `CANCELLED` by the background worker. Slot availability logic ignores expired holds. This gives the patient enough time to finish confirmation without permanently blocking the doctor's schedule.

## 4. Doctor leave conflict handling

A doctor leave record contains a start and end date/time. New slot generation checks leave records before exposing availability. More importantly, booking performs the leave check again inside its transaction so a stale frontend cannot bypass leave rules.

If an admin creates leave over existing pending or confirmed appointments, those affected appointments are cancelled. A leave-change notification is queued for both the patient and doctor, and calendar deletion jobs are created for connected calendars. This keeps the booking database, notifications and calendar state aligned without requiring the admin to manually cancel each appointment.

## 5. Notification failure handling

Booking confirmation, cancellation, leave changes, medication reminders and other emails are written to a durable `Notification` table rather than being sent directly inside the user request. A background worker reads pending jobs and sends them through SMTP/Nodemailer. Failures increment an attempt counter and schedule another attempt using exponential backoff. After five failed attempts, the record remains marked `FAILED` for investigation instead of being retried forever.

Calendar actions follow the same pattern through `CalendarEvent`. A successful appointment does not fail merely because Google Calendar or SMTP is temporarily unavailable. This separation is important because external services should not compromise the core booking transaction.

## 6. LLM integration and safety

The symptom form is processed by an LLM adapter that requests a strict JSON response containing urgency, chief complaint and three suggested questions. The output is stored in the database for the doctor. The post-visit adapter converts clinician notes and prescription text into a patient-friendly summary, medication schedule and follow-up steps.

LLM calls are treated as optional enrichment, not a dependency for core scheduling. Missing API credentials, rate limits, malformed output or provider failures trigger a deterministic fallback summary. The UI and database workflow therefore continue to operate. The LLM is instructed not to diagnose or invent clinical facts; urgency is presented as triage guidance only.

## 7. Google Calendar

Users can connect Google Calendar using OAuth 2.0. Tokens are stored against the user account and calendar operations are queued as create/update/delete jobs. Booking creates events for both patient and doctor; rescheduling queues updates; cancellation and leave conflicts queue deletion. Token refresh is handled by the Google client where possible, while failed operations remain retryable.

This design separates transactional correctness from unreliable external integrations while still meeting the required healthcare appointment workflow.

## 8. Novelty layer

The minimum appointment workflow is extended with four focused product improvements. Smart Slot Recommendation ranks free slots by earliest availability and patient time preference. Leave Conflict Resolution searches future availability after a doctor's leave and stores up to three alternatives for each affected patient. Notification Reliability exposes durable email/calendar job health to the admin. The Appointment Attendance Assistant changes reminder intensity using only scheduling and historical attendance data, never symptoms or clinical information. These features reuse the same slot engine, background worker and transactional appointment model rather than creating disconnected subsystems.
