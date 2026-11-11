# Appointment timeline — Mock design test

Route: `/appointments/mock`  
Navigation: **Design lab → นัดหมาย · Mock design**  
Source spec: `../klinic-api/docs/appointment/room-timeline-task.md`  
Reviewed: 10 November 2026

## Purpose

Validate the room-centric appointment design before changing backend contracts.
The page imports typed fixtures and uses React memory only. It does not call the
API, read real patients, create real appointments, or persist changes. Refresh
and Reset restore the initial dataset. This public design route does not test
authentication, real RBAC or PostgreSQL concurrency.

## Scenarios

- 10 November 2026: five rooms, six appointments, separate Doctor shift bands.
- Room 1: Doctor A 09:00–13:00, Doctor B 14:00–18:00; 13:00–14:00 is an unassigned shift gap, not a break event.
- Adjacent appointments: 10:55–12:30 and 12:30–13:00; no mandatory minute gap.
- Room 2: Doctor C 09:00–12:00, 13:00–15:00 and 16:00–17:00; no roster at 12:00–13:00. The room has no opening interval at 15:00–16:00, shown as empty space rather than a closure event.
- Room 3: open room with no assigned Doctor.
- Room 4: approved full-day Doctor leave.
- Room 5: no opening intervals or Doctor shifts; an empty lane with no closure card. Booking is unavailable.
- **ทดสอบ 12 ห้อง** adds seven empty rooms for scrolling/sticky-header checks.
- Other dates have no sample shifts/appointments; the page explains how to
  return to the sample date.

## Interactions

### iPad compact layout

Default **ขนาดปกติ** fixes each hour at 160px regardless of screen size. The
tablet/desktop workspace fits the viewport, and its remaining area belongs to
the schedule's internal X/Y scroll container. Time headers and room labels stay
sticky. **พอดีหน้าจอ · ทั้งวัน** is an optional overview using ResizeObserver;
it is not automatically selected when the device rotates. Phones retain page
scrolling with a bounded internally scrollable schedule. Booked lanes are 136px
for one card lane (previously 212px); empty lanes are 86px. Overlapping cards
add 94px per lane. Doctor identity lives in the shift band and detail dialog;
short cards stack start/end times instead of forcing a wide pill.

Each room track isolates and clips its content. Sticky room labels cover all
cards while scrolling horizontally; the time header covers rows when scrolling
vertically, with its corner label above the scrolling time columns.

Header, metrics and filter spacing are condensed on tablets. Verified iPad
landscape/portrait targets (1024×768 and 768×1024): the hour width remains 160px
after rotation. In the 12-room scenario, horizontal and vertical content exceed
the canvas, both axes scroll internally, and the time header remains at the
canvas top during scrolling. No page-wide horizontal overflow. Short-card
detail remains accessible by touch/click. API and fixtures are unchanged by
this layout work.

Search patient/name/reason; filter Doctor/Room; show only rooms with matching
appointments; change date; zoom hourly width; scroll a bounded timeline with
sticky time/room labels. Click appointment cards or unavailable blocks to open
native modal details rendered as label/value text. Appointment detail contains
no inputs or dropdowns. SCHEDULED appointments have Reschedule and Cancel
actions that open separate forms; other statuses explain why these actions are
unavailable. Reschedule validates the room, Doctor shift and conflicts before
updating the mock appointment. Cancel requires a reason, stores it on the mock
record and removes the cancelled appointment from the active timeline. Neither
action calls the API. Tap the
Doctor shift band or use the accessible Create button to open a separate mock booking
form. Card overlap uses separate lanes.

Timeline space outside Doctor shift borders stays white and does not open the
booking form. Shift bands support a single tap/click and Enter/Space to start booking.
Room opening intervals still validate bookings, without a gray background layer.

### Registration preview

Tapping a blank part of a Doctor shift prefills date, room and Doctor. The tapped
time rounds to the nearest five minutes inside the shift. The proposed end is
the next active appointment start for that room or Doctor, capped at the shift
end, room opening end and applicable block start. Without a next appointment it
extends to the available shift boundary. For example, a 09:30 start with a
10:30–11:00 booking suggests 10:30 as the end. Changing the start, room or Doctor
recalculates this suggestion for new bookings; the end remains editable.
A live duration label under the time fields displays
minutes or hours and minutes (for example, 55 minutes or 1 hour 30 minutes), and
explains invalid time ranges without displaying a negative/NaN duration. Search the six
fictional patients by name, phone, HN or sample ID, then explicitly select a
result. Changing the search clears the selection. No-match results explain how
to search again; creating a new patient and suggesting available slots are
deferred. Enter an appointment purpose/initial symptoms, then review a label-only
summary. Going back preserves all fields; only Confirm adds the appointment.
Both Review and Confirm validate intervals and conflicts. Existing appointment
cards continue to open details, rather than registration. All patient phone
numbers are fictional fixtures; there is no patient API call.

Mock validation checks the whole appointment against room opening intervals,
Doctor shifts, applicable unavailability and Doctor/Room/patient conflicts.
Adjacent half-open intervals are permitted. COMPLETED/CANCELLED do not block
new mock bookings, matching the current ordinary active-appointment policy;
the final production timeline policy still needs approval in the source spec.

## Browser checks performed

| Check | Result |
| --- | --- |
| Open `/appointments/mock` without Clinic credentials | Pass |
| Visible five-room timeline, empty room and approved leave | Pass |
| Create 11:00–12:00 in Room 1 | Rejected against 10:55–12:30 |
| Book with Doctor D in Room 4 | Rejected: approved leave |
| Book Room 3 without a Doctor shift | Rejected: outside Doctor schedule |
| Book Room 2 at 15:00–16:00 with no opening interval | Rejected: outside room opening; no closure card displayed |
| Create 09:15–10:55 in Room 1 | Pass; adjacent existing start 10:55 |
| Existing appointment detail | Read-only labels; zero input/select/textarea elements |
| Create appointment modal | Retains editable booking fields, separate from detail |
| Reschedule / Cancel | Separate forms from label-only detail; SCHEDULED only; cancellation reason required |
| Single tap on Doctor shift | Opens registration with room/Doctor/date and a five-minute-rounded start |
| Patient lookup | Phone search selects the matching fixture; unknown search displays no-match feedback |
| Registration conflict | 11:00–11:30 in Room 1 rejected; entered patient/purpose retained |
| Review and Back | No new card before confirmation; Back preserves patient and purpose |
| Confirm registration | New patient-f appointment 09:00–09:30 appears once; count changes from 6 to 7 |
| Next queue suggestion | Move the first mock booking to 10:30–11:00; new start 09:30 suggests end 10:30 |
| No next queue | Room 2 / Doctor C start 16:00 suggests shift end 17:00 |
| 12-room scenario and Doctor filter | Pass |
| Narrow-screen controls and contained horizontal timeline | Visually checked |

`npm run lint` and `npm run build` pass. These checks establish local UI
behaviour only; the proposed timeline/interval APIs are not implemented here.
