# Member portal API integration

This guide describes the B2C-facing surface of the existing NestJS gateway. B2C and B2B are separate controller/access boundaries inside the same API and domain modules; they are not separate services. The OpenAPI document in `shared/api-contracts/openapi.yaml` is the machine-readable source of truth.

## Request setup

- Set the frontend API base URL from the integration environment; do not hard-code a developer machine or production URL.
- Resolve the studio/tenant using the configured tenant host, then send the member access token returned by OTP or Google sign-in as `Authorization: Bearer <access_token>` for member-only routes.
- Use JSON requests. The gateway validates and rejects unknown body fields.
- Never send a member ID to identify the current member. The gateway resolves it from the authenticated account's ERP link.
- Public routes still require the tenant host context. They do not accept a tenant ID in the request body.

## Public discovery and enquiry

| Method and path | Purpose | Access |
| --- | --- | --- |
| `GET /classes` | Active class catalogue | Public, tenant-resolved |
| `GET /classes/{id}` | Class details | Public, tenant-resolved |
| `GET /classes/{class_id}/schedules` | Class schedules | Public, tenant-resolved |
| `GET /memberships/plans` | Active tenant plans | Public, tenant-resolved |
| `GET /events/public` | Published public events | Public, tenant-resolved |
| `POST /leads/public` | Studio enquiry; accepts `full_name`, `phone`, optional `email` | Public, tenant-resolved, rate-limited |
| `POST /events/public/{id}/registrations` | Free public event registration | Public, tenant-resolved, rate-limited |

The public enquiry API sets the lead source and initial status itself. Do not send staff-only fields such as assignment, notes, or conversion status.

## Member sign-in and self-service

Member sign-in endpoints are under `/auth/member` (OTP request/verify and Google sign-in). On success, retain the short-lived access token according to the frontend team's secure session design and send it only to the configured gateway origin.

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /members/me` | Read own profile | Member token required |
| `PUT /members/me` | Update editable profile fields | No phone/login identity, account status, or membership link fields |
| `GET /memberships/me` | Read own memberships | Member reference comes from the token's verified ERP link |
| `POST /memberships/me` | Start a membership | Creates a pending ERP membership; it is not active until payment is verified |
| `GET /bookings` | List own bookings | Member token automatically scopes results |
| `POST /bookings` | Book a class schedule | Send `class_schedule_id` and `booking_date`; omit `member_id` |
| `POST /bookings/{id}/cancel` | Cancel own booking | ERP policy/cancellation window applies |
| `GET /attendance/member/{member_id}` | Read own attendance | Use the `id` from `/members/me`; server verifies ownership |
| `GET /payments` | Read own payment history | Member token automatically scopes results |
| `POST /payments` | Start a Razorpay payment | Send `Idempotency-Key` UUID; member identity is taken from the token |
| `POST /events/{id}/registrations` | Register as a member | Member identity is taken from the token; paid events are not enabled in this flow |

Membership checkout sequence: load active plans → create a pending membership → create a Razorpay order with that membership ID and the plan amount → wait for the verified provider webhook → refresh membership status. Never display a membership as active based only on order creation or browser payment success.

Booking sequence: load classes and schedules → submit booking → display the returned `confirmed` or `waitlisted` result → refresh booking state as needed. A network timeout is an unknown result; fetch the booking state before retrying a new booking.

## Ownership boundary

- Staff-only member, membership, class, lead and event management remains in staff controllers with staff permission checks.
- Public discovery/enquiry and member self-service are isolated in separate public/member controllers within those same domain modules.
- Booking, attendance, payment and member event-registration operations intentionally keep their documented URLs and share the route handler where staff and member roles both need the operation. Member requests are tenant-checked, permission-checked and scoped to the linked member reference.
- The gateway is the only frontend-facing service. The browser must not call Frappe/ERPNext, PostgreSQL, or Razorpay directly.

## Integration test checklist

1. Public catalogue/enquiry works only when the tenant host resolves; enquiry rate limits are enforced.
2. A member can read/update only their linked profile and cannot alter phone/login identity, status, or membership ownership.
3. A member cannot read another member's memberships, bookings, attendance, or payments by changing a URL/body identifier.
4. Membership remains pending until a signed/idempotent Razorpay webhook confirms payment.
5. Staff CRUD still requires its role permission; public/member routes do not grant staff permissions.
6. Verify the canonical member flow against a non-personal test tenant and real test providers before calling it end-to-end complete.
