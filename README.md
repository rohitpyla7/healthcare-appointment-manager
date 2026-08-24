# Healthcare Appointment & Follow-up Manager

A full-stack healthcare appointment platform with patient, doctor and admin portals. It supports safe slot booking, symptom intake, AI summaries, post-visit summaries, medication reminders, email notifications and Google Calendar integration.

## Stack

- Next.js + React + TypeScript
- PostgreSQL + Prisma ORM
- JWT authentication with HTTP-only cookie
- OpenAI-compatible LLM integration
- Nodemailer SMTP email service
- Google Calendar API + OAuth 2.0
- `tsx` worker for reminder/retry background jobs

## Local setup

1. Install Node.js 22+ and PostgreSQL.
2. Copy `.env.example` to `.env.local` and fill the values.
3. Install packages:
   `npm install`
4. Generate Prisma client:
   `npm run db:generate`
5. Create/update the database:
   `npm run db:push`
6. Seed demo users/doctors:
   `npm run seed`
7. Start the app:
   `npm run dev`
8. In another terminal run the worker:
   `npm run worker`

## Demo accounts after seeding

- Admin: `admin@healthcare.local` / `Admin@12345`
- Doctor: `doctor@healthcare.local` / `Doctor@12345`
- Patient: `patient@healthcare.local` / `Patient@12345`

Change these credentials before deployment.

## API overview

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Doctors / slots
- `GET /api/doctors?specialisation=Cardiology`
- `GET /api/doctors/:id/slots?date=2026-09-01`

### Appointments
- `POST /api/appointments`
- `GET /api/appointments`
- `POST /api/appointments/:id/cancel`
- `POST /api/appointments/:id/reschedule`
- `POST /api/appointments/:id/symptoms`
- `POST /api/appointments/:id/post-visit`

### Admin
- `POST /api/admin/doctors`
- `PATCH /api/admin/doctors/:id`
- `POST /api/admin/leaves`
- `DELETE /api/admin/leaves/:id`

### Google Calendar
- `GET /api/google/calendar/connect`
- `GET /api/google/calendar/callback`

## Double-booking strategy

The booking endpoint validates the doctor's working hours and leave days, then performs the slot conflict check and insert inside a Prisma transaction using PostgreSQL `Serializable` isolation. Each booking transaction also takes a PostgreSQL transaction-scoped advisory lock derived from `(doctorId, startTime)`. This serializes concurrent attempts for the same slot, while still allowing an expired pending hold to be replaced without waiting for a cleanup job. If two requests race, one transaction wins and the other receives a conflict response.

## Slot hold strategy

The UI creates a short-lived pending hold before the final confirmation. `holdExpiresAt` is stored on the appointment. The worker periodically marks expired pending holds as cancelled. The final booking transaction rejects any non-expired active appointment occupying the slot.

## Leave conflict handling

Creating a leave period checks for appointments in that date/range. Existing appointments are cancelled and notification jobs are queued for affected patients. New slots are blocked for the leave period.

## Notification reliability

Emails and calendar operations are represented as durable `Notification` / `CalendarEvent` records. Failed operations are retried by the worker with exponential backoff. A failed email/calendar integration never rolls back a successful appointment booking.

## LLM prompts

Pre-visit:
`Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>`

Post-visit:
`Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>`

The application stores generated outputs. If the LLM is unavailable, booking/visit submission still succeeds and a safe fallback summary is stored.

## Google Calendar setup

1. Create a Google Cloud project.
2. Enable Google Calendar API.
3. Configure OAuth consent screen.
4. Create an OAuth Web application credential.
5. Add the redirect URI from `GOOGLE_REDIRECT_URI`.
6. Put client ID/secret in `.env.local`.
7. A doctor/patient connects their calendar through `/api/google/calendar/connect`.

## Deployment

Deploy the Next.js app to a Node-compatible host and PostgreSQL to a managed PostgreSQL provider. Run the worker as a separate long-running process (`npm run worker`) or convert the worker endpoint to the scheduler available on your chosen host.

Do not commit `.env`, secrets, `node_modules`, build output or editor folders.

## Product differentiation — Smart CareFlow layer

The implementation intentionally goes beyond the minimum booking workflow while staying within the assignment's scope.

### 1. Smart Appointment Finder

Patients can request a preferred time window and date range. CareFlow ranks available slots by earliest availability and preference match, then explains why each recommendation was selected.

### 2. Leave Conflict Resolver

When a doctor is placed on leave, affected appointments are cancelled and patients are notified. The system also searches the next available schedule and stores up to three alternative appointment options. Patients can accept an alternative atomically; the booking, notifications and Google Calendar updates are then queued together.

### 3. Notification Reliability Center

Email and Google Calendar actions are durable background jobs. The admin portal exposes sent, pending and failed integration counts and recent failures. Failed jobs retry with exponential backoff and stop after five attempts.

### 4. Appointment Attendance Assistant

Reminder behavior uses appointment logistics and historical attendance status only. A standard appointment receives a 24-hour reminder. Patients with a recent history of repeated cancellations receive an additional two-hour confirmation reminder. No symptom or medical information is used to determine reminder behavior.

### 5. Doctor AI Triage View

The required pre-visit summary becomes a ranked visual queue for the doctor, highlighting high-urgency summaries while clearly labeling them as AI-generated triage guidance rather than diagnosis.
