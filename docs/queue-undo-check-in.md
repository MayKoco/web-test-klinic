# Undo Check-in in Queue UI

`/queue` → a **รอรักษา** card → **ย้อนกลับรอ Check-in**.

- Visible only for `WAITING` and when the current user has all QUEUE_FRONT_DESK
  permissions: QUEUE_VIEW, QUEUE_MANAGE, APPOINTMENT_CHECK_IN,
  APPOINTMENT_COMPLETE. Default Staff has this group; read-only Doctors do not.
- A modal requires a non-whitespace reason (max 500 characters). It displays
  patient and appointment number, and explains that date/time/Doctor/Room stay.
- Calls existing `POST /appointments/:id/undo-check-in` with `{ reason }`.
- The existing API atomically transitions WAITING → SCHEDULED, clears checkedInAt
  and records actor/reason in AuditLog. No API contract or permission change.
- Successful submission closes the modal and reloads the current board.
- Duplicate submissions and closing/Escape while saving are blocked. 404/409
  refreshes the board, preserves the reason and disables resubmission; other
  errors remain visible with retry available.

Verified using a newly created isolated test visit in CLINIC-0001 on 2026-11-20:
empty and whitespace reasons disabled confirmation; a real reason succeeded,
the card moved to the scheduled section, and an API read confirmed SCHEDULED
with checkedInAt=null. The test visit was cancelled after verification; the
existing user's WAITING visit was not changed. Lint, TypeScript and Next build
passed.

## Doctor undo-start

The same modal also supports START mode for **ย้อนกลับรอรักษา**. The current
Doctor must have QUEUE_CLINICAL and match the card's doctorId, obtained from
`GET /auth/me/permissions`. Only IN_PROGRESS cards without visible saved
treatment show it. Calls `POST /appointments/:id/undo-start`; server eligibility
checks are authoritative. See the API's `docs/appointment/undo-start-handoff.md`.

Verified real Doctor login and UI submission for a dedicated fictional visit:
IN_PROGRESS → WAITING, startedAt=null, checkedInAt preserved, repeated undo=409.
Test visit cancelled after verification.
