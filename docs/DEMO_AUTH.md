# Fitness Studio OS demo sign-in

This frontend demo stores studio accounts and sessions in browser `localStorage`. Account passwords are stored as plain text so the flow stays easy to inspect and replace later. Do not use real personal information or passwords. This is not production authentication or a security boundary.

## Studio accounts

Open `/staff-login` (Studio Login):

| Role | Email | Password | Destination |
| --- | --- | --- | --- |
| Admin | `admin@fitnessstudio.demo` | `Admin@123` | `/staff/dashboard` |
| Front Desk Staff | `staff@fitnessstudio.demo` | `Staff@123` | `/staff/dashboard` |
| Trainer | `trainer@fitnessstudio.demo` | `Trainer@123` | `/staff/trainer` |

Admin can add Staff or Trainer accounts from `/staff/staff`. Newly created accounts remain in the browser that created them and can sign in using their email or phone and the password set in the form.

## Member account

Open `/member-login`. The existing member demo supports Neha Sharma at `9876543210` and Aarav Mehta at `9845088221`; use demo OTP `123456` or choose a fast demo profile. Member sessions open `/portal`.

## Routes

- `/staff-login`: Admin, Front Desk Staff, and Trainer sign in.
- `/member-login`: Member sign in.
- `/staff/dashboard`: Admin and Front Desk Staff workspace.
- `/staff/trainer`: Trainer workspace (also available to Admin).
- `/portal`: Member portal.
