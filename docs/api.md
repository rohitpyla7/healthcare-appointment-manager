# CareFlow API

All protected endpoints use the HTTP-only `healthcare_session` cookie.

## Authentication

- `POST /api/auth/register` — patient registration
- `POST /api/auth/login` — login
- `POST /api/auth/logout` — clear session
- `GET /api/auth/me` — current user and role

## Doctors and availability

- `GET /api/doctors?specialisation=Cardiology` — search doctors
- `GET /api/doctors/:id/slots?date=2026-09-01` — availability for a date
- `GET /api/recommendations/slots?specialisation=Cardiology&date=2026-09-01&preference=morning&days=7&limit=5` — ranked smart slot recommendations

## Appointments

- `POST /api/appointments` — create a five-minute pending hold with symptom intake and AI pre-visit summary
- `POST /api/appointments/:id/confirm` — confirm a held slot; concurrency-safe final check
- `GET /api/appointments` — appointments for the current patient/doctor/admin
- `POST /api/appointments/:id/cancel` — cancel appointment and queue notifications/calendar deletion
- `POST /api/appointments/:id/reschedule` — reschedule with conflict/leave checks
- `POST /api/appointments/:id/symptoms` — update symptom form
- `POST /api/appointments/:id/post-visit` — doctor notes + prescription; generates patient-friendly summary and reminder jobs
- `GET /api/appointments/:id/alternatives` — patient gets alternative slots after a leave conflict
- `POST /api/appointments/:id/alternatives/accept` — atomically accepts an alternative slot

## Admin

- `POST /api/admin/doctors` — create doctor profile
- `PATCH /api/admin/doctors/:id` — update doctor profile
- `POST /api/admin/leaves` — create leave; cancel affected bookings, notify users, queue calendar deletion and generate alternatives
- `DELETE /api/admin/leaves?id=...` — remove leave
- `GET /api/admin/notifications` — notification/calendar reliability metrics and failed jobs
- `GET /api/admin/attendance` — appointment attendance metrics used by the reminder assistant

## Google Calendar

- `GET /api/google/calendar/connect` — start OAuth 2.0 flow
- `GET /api/google/calendar/callback` — OAuth callback

## LLM behavior

### Pre-visit prompt

The model receives symptoms and must return JSON containing:

- `urgency`: `Low`, `Medium`, or `High`
- `chiefComplaint`
- exactly three suggested questions

The system prompt explicitly forbids diagnosis and treats urgency as triage guidance only.

### Post-visit prompt

The model receives clinician notes and prescription text and returns JSON containing:

- patient-friendly `summary`
- `medicationSchedule[]`
- `followUpSteps[]`

The model is instructed not to invent clinical facts.

## Reliability contract

Appointment correctness is transactional. Email and Google Calendar are asynchronous jobs. A provider outage cannot roll back a successful booking. Jobs retry with exponential backoff and are visible through the admin Notification Reliability Center.
