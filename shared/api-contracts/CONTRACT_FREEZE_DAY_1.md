# Day 1 P0 API Contract Freeze

**Owners:** Syed and Yashwanth (SL + ERPE)
**Contract version:** `1.0.0`
**Status:** Frozen for the Day 1 implementation baseline.

This record freezes the existing OpenAPI contract in this directory for the Day 1 P0 scope. It does not add features or change the delivery order.

## Day 1 source-conflict decisions

| Source conflict | Day 1 decision |
| --- | --- |
| PRD places AI in the initial must-complete list; Module Specification places it after P0 | AI capabilities remain P1 and are not implemented in this Day 1 branch. |
| Module Specification counts 19 ERP DocTypes; Database Design counts 20 | Use the Database Design baseline for the ERP build. Existing later-scope DocTypes are preserved, not expanded or modified by this branch. |
| Redis and booking latency targets differ | Redis is not introduced in Day 1. The gateway keeps the documented ERP timeout configuration; performance work is deferred to its scheduled delivery day. |
| Role names in the documents are incomplete | Syed owns SL and Yashwanth owns ERPE for this branch. No DBE, AI, or frontend areas are changed. |
| “Deployment” could mean production | Day 1 produces an installable custom-app package and local validation only. The documented Beta/Demo deployment is performed on its scheduled delivery day. |

## Frozen P0 resources

- Members: `members.yaml`
- Memberships and cancellation: `memberships.yaml`
- Classes and class schedules: `classes.yaml`, `class-schedules.yaml`, `schedules.yaml`
- Bookings: `bookings.yaml`
- Attendance: `attendance.yaml`
- CRM leads: `leads.yaml`
- Payments: `payments.yaml`

## Contract rules

- The API contract is `api/openapi.yaml`; path and schema files are its source files.
- ERP/Frappe generates resource IDs. Clients must not send an `id` in create requests.
- Protected public API operations use the declared bearer-auth scheme. The tenant is resolved from the request host and bound to the authenticated context; clients cannot select another tenant through a request header, body, query, or resource ID.
- Validation failures use `400`, unauthenticated requests use `401`, authorization failures use `403`, missing records use `404`, and uniqueness/business conflicts use `409` where declared by the resource contract.
- Any contract change must update this OpenAPI source before implementation and must be reviewed by the SL owner.

## ERP Day 1 foundation

The `wellness_studio` custom Frappe app is the ERP integration target. Its Day 1 DocType baseline is the existing tenant, member, membership-plan, membership, class/session, booking, attendance, payment, event, and lead definitions. The gateway readiness check calls `wellness_studio.api.health.health` through `FRAPPE_BASE_URL`.
