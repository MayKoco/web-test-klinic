# Appointment Timeline — Live API test UI

Updated: 13 November 2026.

Route: `/appointments/mock` (legacy URL retained). It now uses real Clinic APIs;
there is no mock fallback, fixture reset, or simulated write. Navigation:
**Design lab → นัดหมาย · Timeline API**. Select a date or open
`/appointments/mock?date=2026-11-20`; the selected day survives page reload.

Backend contract:
`../klinic-api/docs/appointment/room-timeline-api-handoff.md`.
The production `klinic-management-system` frontend is unchanged.

## API mapping

| UI | API |
| --- | --- |
| Session and allowed actions | `GET /auth/me/permissions` |
| Rooms, shifts, availability, cards and details | `GET /appointments/timeline?date=&page=&limit=100` |
| Patient search, HN/name/phone, 10 results/page | `GET /patients?search=&page=&limit=10` |
| Selected start → next occupied/effective boundary | `GET /appointments/booking-suggestion` |
| Confirm registration | `POST /appointments` with explicit startTime/endTime |
| Reschedule time/Doctor/Room | `PATCH /appointments/:id` with the complete interval |
| Cancel with reason | `POST /appointments/:id/cancel` |

Requests use `apiRequest` and the existing `/api/clinic` proxy with the current
Clinic session token. No credentials/tokens are added to URLs. Login is required;
missing/expired sessions show a login action, denied access or network errors
show retry feedback. No fake records are substituted on errors.

`lib/appointment-timeline.ts` maps the API shape into presentation data. The old
`lib/appointment-timeline-mock.ts` fixtures remain unmodified and are not imported
by this live component. Minute cards and PENDING_NOTE are supported. Doctor
colours are a stable hash of their ID, not appointment statuses or role rules.

## Interaction and performance

- Load every room page and all cards per returned room. Subsequent pages pin the
  first response's Clinic-local date, including when the first request omitted
  a date. Do not use appointment-list pagination as complete occupancy.
- Preserve fixed hourly width and bounded internal X/Y scrolling, sticky room
  labels/time header and label-only appointment detail from the approved design.
  Hour headers/display extent now come from the API, including empty rooms.
- Booking can start only within a shift's effective bookingIntervals. Blank space
  outside those intervals is not a booking target. Actual unavailability remains
  visible; there are no invented lunch/closure events.
- Patient search debounces 300 ms, paginates and aborts obsolete requests. Typing
  a new query clears the previous patient selection. Explicit selection is
  required; no new-patient creation is included.
- New-booking suggestions debounce 200 ms and abort obsolete requests. Doctor,
  Room, start and selected patient affect the suggestion. Manual end edits are
  retained rather than overwritten by a late response. Server confirmation
  remains authoritative and suggestions never reserve time.
- Review does not write. Confirm performs the actual POST; pending requests
  disable submission, modal exits and Esc. Writes are not automatically retried.
- On a 409, preserve the entered draft/review, display the API code and refresh
  the background timeline. A successful write closes the dialog and reloads
  authoritative cards. A refresh error after a successful write cannot turn the
  write into another automatic submission.
- This version's reschedule form changes time/Doctor/Room within the displayed
  day. Moving an existing appointment to another day needs a future dedicated
  date/availability interaction. The backend already supports date changes.

## Access

Frontend controls derive from API permissions, never the cached role name.
APPOINTMENT_OPERATION requires the same five permission codes as the backend.
New registration also requires the existing CUSTOMER_OPERATION group for patient
lookup. A custom booking role lacking that group sees an explanation; no broader
patient permission or alternative lookup API is silently granted.

Read-only Doctors load only their scoped API timeline, cannot create, and see
label-only details without reschedule/cancel buttons. No patient search or
booking-suggestion request is made for that role. SCHEDULED-only reschedule and
cancel actions retain the mock's accepted UI policy; other queue/treatment
transitions are not added here.

## Verification evidence

Local test Clinic: QA Subscription 3 Branches. Explicitly named QA fixtures:
20 November 2026, three rooms (one empty), two Doctors, twelve fictional patients,
including a private partial-leave fixture whose reason must not be displayed.
Baseline QA appointments remain for review. No real customer/patient records were
used or changed and no email was sent by these checks.

| UI check | Observed result |
| --- | --- |
| No session | Login action; no mock data |
| Staff session | Loads real room, shift, availability and card records |
| Tap/keyboard activate Doctor shift; start 09:30, next booking 10:30–11:00 | Suggestion ends 10:30; duration one hour |
| Search TQA-03 and explicitly select | Patient HN/name displayed in review |
| Review before Confirm | PostgreSQL appointment count for that patient remains zero |
| Confirm | One real 09:30–10:30 appointment appears |
| Reschedule | Real PATCH stores 11:00–11:20 |
| Competing booking inserted after Review | Confirm gets APPOINTMENT_CONFLICT/409; patient/purpose/times retained, no duplicate draft persisted |
| Cancel without reason | Browser required validation prevents submission |
| Cancel with reason | Real appointment becomes CANCELLED and disappears from active timeline |
| Audit | CREATE, UPDATE, CANCEL entries point to the actual Staff actor |
| Doctor login | Only own room/Doctor/appointment appears; other Doctor and room absent |
| Doctor detail | Zero input/select/textarea controls and only Close buttons |

Screenshots are local verification artifacts under `/tmp/klinic-timeline-*-live.png`.
The earlier 10 November fixture-only mock is historical design evidence, not a
claim that current requests are simulated. Production frontend integration,
rescheduling to a different day, push updates and drag/resize remain separate work.
