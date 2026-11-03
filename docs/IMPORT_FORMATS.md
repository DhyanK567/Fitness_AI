# CSV Import and Export Formats

The Admin **Import & Export** page accepts one CSV dataset at a time or a batch of up to eight CSV files. A dataset is identified from its header row. Batch files are processed in dependency order so members and classes are available before bookings, and bookings are available before attendance. You can also download any selected datasets individually or together as separate CSV files.

Ready-to-import test files are in `Data/`. `universal-studio-demo.csv` loads all eight datasets. `people-crm-demo.csv`, `operations-demo.csv`, and `finance-demo.csv` load focused modules. Each file is plain RFC-4180 CSV with a `dataset` column; upload it from **Choose CSV Files (Universal or Module)**. No JSON data packages are used.

## General rules

- Maximum 5,000 data rows per file and 10 MB per file.
- Use ISO dates (`YYYY-MM-DD`) and ISO timestamps. Legacy `M/D/YYYY` dates are accepted where a date-only field is used.
- Indian mobile numbers may be entered with or without the `+91` prefix.
- Member and lead emails are normalized to lowercase.
- Every operation is scoped to the signed-in tenant.
- Duplicate policy can skip matching records or update them. Retrying a completed batch with `skip` is safe.
- Source UUIDs are mapped to stable tenant-owned IDs. Related booking, attendance, and payment rows can therefore reference the source IDs across separate imports without sharing IDs between tenants.

## Dataset headers

Headers are case-insensitive. Keep the listed names for best compatibility.

| Dataset | Required columns | Optional columns |
| --- | --- | --- |
| Members | `name`, `email` | `id`, `phone`, `plan`, `status`, `joined`, `expiry`, `coach` |
| Leads | `name`, and at least one of `email` or `phone` | `source`, `stage`, `followUpDate`, `assigned`, `plan`, `notes` |
| Classes | `name`, `date`, `startTime`, `trainer` | `id`, `category`, `endTime`, `room`, `capacity`, `status` |
| Memberships | `name`, `planType` | `priceINR` (or `price`), `sessionLimit`, `benefits`, `active` |
| Bookings | `memberId`, `classId` | `id`, `status`, `bookedAt` |
| Attendance | `bookingId` | `memberId`, `className`, `date`, `status`, `checkedInAt` |
| Payments | `ref`, `memberId`, `amount` | `type`, `date`, `currency`, `method`, `status`, `refundedAmount`, `notes` |
| Events | `title`, `startAt` | `category`, `description`, `endAt`, `venue`, `organizer`, `capacity`, `cancelled`, `published` |

### Allowed values

- Member plans: `Basic`, `Premium`, `Ultra Premium`.
- Member statuses: `Active`, `Review`, `Paused`, `Frozen`, `Inactive`.
- Booking statuses: `Confirmed`, `Waitlisted`, `Cancelled`.
- Attendance statuses: `Present`, `Late`, `Absent`.
- Membership plan types: `Monthly`, `Quarterly`, `Annual`, `Drop-in`, `Lifetime`, `Half-Yearly`.
- Payment statuses: `Paid`, `Pending`, `Review`, `Failed`, `Refunded`, `Partially Refunded`.

## Example header rows

```csv
id,name,email,phone,plan,status,joined,expiry,coach
name,email,phone,source,stage,followUpDate,assigned,plan,notes
id,name,category,date,startTime,endTime,trainer,room,capacity,status
name,planType,priceINR,sessionLimit,benefits,active
id,memberId,classId,status,bookedAt
bookingId,memberId,className,date,status,checkedInAt
ref,memberId,type,date,amount,currency,method,status,refundedAmount,notes
title,category,description,startAt,endAt,venue,organizer,capacity,cancelled,published
```

The import page provides single-file upload, pasted CSV, server-side dry-run validation, duplicate handling, and multi-file batch import. A universal or module CSV includes a `dataset` column and canonical dataset fields; the importer splits records by dataset and processes them in dependency order. Batch processing stops at the first dataset with validation or write errors and displays row-level details; completed datasets can be safely retried.

## Export

Exports use `GET /api/v1/import-export/export/:dataset` and return RFC-4180 CSV. Select one dataset for a single download, or select several to download each dataset as its own CSV file. **Download selected as Universal CSV** combines selected tenant-scoped datasets into one CSV with a `dataset` discriminator column, which the importer can split back into datasets. Export headers and fields match the import contracts above.
