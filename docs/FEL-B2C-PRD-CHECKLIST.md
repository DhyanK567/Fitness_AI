# FEL B2C PRD Checklist

This checklist maps the Master PRD B2C member-portal scope to the current frontend routes. It is intentionally limited to FEL frontend ownership; backend/API readiness is tracked separately.

| PRD area | Frontend route | Status | Evidence |
| --- | --- | --- | --- |
| B2C-01 Dashboard | `/member/home` | Complete | Membership status, credits, upcoming classes, events, and renewal actions are shown. |
| B2C-02 Membership | `/member/my-membership` | Complete | Plan comparison, INR pricing, checkout review, and pending verification state are present. |
| B2C-03 Bookings | `/member/book-class` | Complete | Shared catalog, category filters, search, booking confirmation, cancellation, and waitlist state are present. |
| B2C-04 Attendance | `/member/check-in` | Complete | Digital QR pass, simulated check-in success, and attendance history are present. |
| B2C-05 Events | `/member/events` | Complete | Shared workshops include breathwork, meditation, yoga, dance, and ticket verification state. |
| B2C-06 Payments | `/member/my-payments` | Complete | Payment history, receipts, and invoice presentation are present. |
| B2C-07 Profile | `/member/my-profile` | Complete | Profile details and edit controls are present. |
| B2C-08 Notifications | Member shell | Deferred | The PRD defers the in-app notification center and communication preferences from Phase 1. |
| B2C-09 Recommendations | `/member/recommendations` | Partial | The experience exists, but recommendations remain static until the recommendation service is connected. |

## Catalog coverage

The shared FEL B2C catalog now drives public classes, member bookings, public workshops, and member workshops. It explicitly includes Yoga, Pilates, Meditation, Dance, Fitness, and Breathwork. The PRD describes a configurable wellness product rather than prescribing fixed workshop titles, so these are product coverage entries rather than an exact-name requirement.

## Remaining integration work

- Connect login, booking, membership, payment, and event actions to the live APIs.
- Replace static recommendation content with personalized results.
- Add the deferred notification center when Phase 1 deferral is lifted.
