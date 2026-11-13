# Queue ordinary walk-in

Entry: `/queue` → **+ Walk-in ปกติ**. Uses live APIs, not mock data.

1. Search/select an existing patient (10 results/page).
2. Optionally select an active Doctor. The default searches across all Doctors;
   selecting one restricts the search to that Doctor, without an automatic fallback.
3. Enter the service duration in minutes (default 30).
4. Read the earliest available **today**, Doctor, Room and service start/end.
5. Confirm to create `WALK_IN` / `SCHEDULED`, then perform Check-in separately.

`GET /appointments/walk-in-slot` takes patientId/durationMinutes and optional doctorId and returns
slot or null. `POST /appointments/walk-ins` confirms the exact suggested interval.
The API is authoritative for Clinic timezone/current time and revalidates the
slot. A stale or occupied time shows an error; **ค้นหาเวลาใหม่** gets a fresh
suggestion. No automatic mutation retry, no fallback to future dates.

Permission gate: all APPOINTMENT_OPERATION and CUSTOMER_OPERATION codes, matching
existing patient search permissions. Read-only Doctors do not see the button.
Urgent Walk-in remains a separate existing flow.

Changing Doctor immediately invalidates the previous suggestion and aborts stale
requests. Active Doctor options load all API pages, independently of the board
filter. Confirmation uses the Doctor/Room from the current valid suggestion.

When Doctor is unspecified the API returns `suggestions`: one earliest fitting
slot per available Doctor, sorted by start time. The dialog shows selectable
Doctor cards with time/Room, initially choosing the earliest recommendation.
Selecting a card uses its exact Doctor/Room/interval on confirmation, without
changing the optional Doctor filter. Changing patient/filter/duration invalidates
all suggestions; a fresh result resets selection to the earliest match.
