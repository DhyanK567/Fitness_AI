import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  H1,
  H2,
  H3,
  Pill,
  Stack,
  Text,
  useHostTheme,
} from "cursor/canvas";

const stages = [
  ["1", "Client / frontend", "Sends requests according to the frozen contract."],
  ["2", "OpenAPI contract", "Defines members, memberships, classes, bookings, attendance, leads, and payments."],
  ["3", "Gateway", "Resolves tenant context, creates correlation IDs, and forwards ERP calls safely."],
  ["4", "Frappe / ERPNext", "Hosts the assigned Fitness DocTypes and the health endpoint."],
  ["5", "PostgreSQL", "Stores platform, IAM, config, operations, and audit foundations with tenant RLS."],
];

const qa = [
  ["What did we complete?", "Only Syed and Yashwanth’s documented Day 1 SL + ERPE scope: API contract freeze, gateway foundation, database foundation, assigned Frappe DocTypes, health endpoint, and verification tests."],
  ["Are we using Prisma and PostgreSQL?", "Yes. Prisma defines and validates the PostgreSQL schema. PostgreSQL is the actual relational database. Prisma is the application schema and migration tool; it is not a replacement for PostgreSQL."],
  ["Do we need a PostgreSQL API key from a website?", "Not for local PostgreSQL itself. Local development uses a DATABASE_URL connection string. A hosted provider may give a password, connection string, pooler URL, or API key depending on that provider. We must use the provider’s documented credential and never commit it."],
  ["Why are there tenant and audit protections?", "The plan requires multi-tenant isolation and an audit trail. The migrations add tenant context helpers, row-level security, append-only audit protections, outbox events, idempotency keys, and webhook inbox foundations."],
  ["Did we build frontend screens or AI features?", "No. Those are outside this Day 1 handoff. AI remains P1 and no unrelated frontend or teammate-owned work was added."],
  ["How do we prove it works?", "The isolated folder passes 7 Python contract checks, 7 gateway unit tests, 1 gateway E2E test, Prisma validation, TypeScript compilation, and Python compilation."],
  ["Where is the official work?", "Fitness/Coding Work on branch feature/fitness-day1-sl-erpe. The PR is the review point; the old branch is not the pivot-work branch."],
];

function Flow({ theme }: { theme: ReturnType<typeof useHostTheme> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, alignItems: "stretch" }}>
      {stages.map(([number, title, detail], index) => (
        <div key={title} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <div style={{ flex: 1, padding: 12, background: theme.bg.elevated, border: `1px solid ${theme.stroke.primary}`, borderRadius: 8 }}>
            <div style={{ color: theme.accent.primary, fontSize: 12, fontWeight: 600, marginBottom: 5 }}>{number}</div>
            <div style={{ color: theme.text.primary, fontSize: 14, fontWeight: 600, marginBottom: 5 }}>{title}</div>
            <div style={{ color: theme.text.secondary, fontSize: 12, lineHeight: "17px" }}>{detail}</div>
          </div>
          {index < stages.length - 1 ? <div style={{ alignSelf: "center", color: theme.text.tertiary, fontSize: 18 }}>→</div> : null}
        </div>
      ))}
    </div>
  );
}

export default function FitnessDay1TeamHandoff() {
  const theme = useHostTheme();
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 28, background: theme.bg.editor, color: theme.text.primary }}>
      <Stack gap={6}>
        <div>
          <Pill tone="info">Fitness · Day 1 · SL + ERPE</Pill>
          <H1>Syed + Yashwanth team handoff</H1>
          <Text color="secondary">A visual, end-to-end explanation of the isolated pivot work completed on 30 September 2026.</Text>
        </div>

        <Callout tone="info" title="Scope boundary">
          Only the documented Day 1 assignment was handled. The work is isolated in Fitness/Coding Work; old Cal/KAL Studio work, frontend database changes, PDFs, and unrelated teammate work were not included.
        </Callout>

        <Card>
          <CardHeader title="End-to-end request and data flow" />
          <CardBody><Flow theme={theme} /></CardBody>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
          <Card>
            <CardHeader title="What was completed" />
            <CardBody>
              <Stack gap={4}>
                <div><H3>API and gateway</H3><Text color="secondary">Frozen OpenAPI resources and actions; host-derived tenant context; safe correlation IDs; ERP adapter forwarding; controlled health response.</Text></div>
                <div><H3>Database foundation</H3><Text color="secondary">Prisma schema plus PostgreSQL migrations for platform, IAM, configuration, operations, audit, RLS, outbox, idempotency, and webhook inbox foundations.</Text></div>
                <div><H3>ERP/Frappe foundation</H3><Text color="secondary">Assigned Fitness DocType metadata and the wellness_studio health endpoint, with no claim of external Frappe Cloud deployment.</Text></div>
                <div><H3>Verification</H3><Text color="secondary">7 Python checks, 7 gateway unit tests, 1 E2E test, Prisma validation, TypeScript compilation, and Python compilation all passed.</Text></div>
              </Stack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Repository handoff" />
            <CardBody>
              <Stack gap={4}>
                <div><Text weight="semibold">Folder</Text><Text color="secondary">Fitness/Coding Work</Text></div>
                <div><Text weight="semibold">Branch</Text><Text color="secondary">feature/fitness-day1-sl-erpe</Text></div>
                <div><Text weight="semibold">Commit</Text><Text color="secondary">1e61dd9 · 73 files</Text></div>
                <div><Text weight="semibold">Review</Text><Text color="link">GitHub PR for feature/fitness-day1-sl-erpe</Text></div>
              </Stack>
            </CardBody>
          </Card>
        </div>

        <div>
          <H2>Team doubts and answers</H2>
          <Stack gap={3}>
            {qa.map(([question, answer]) => (
              <div key={question} style={{ padding: "10px 0", borderBottom: `1px solid ${theme.stroke.primary}` }}>
                <Text weight="semibold">Q: {question}</Text>
                <Text color="secondary">A: {answer}</Text>
              </div>
            ))}
          </Stack>
        </div>

        <Card>
          <CardHeader title="Message to Yashwanth" />
          <CardBody>
            <Text color="secondary">“Yashwanth, as you are new to this project, I completed our assigned Day 1 SL + ERPE work and will share your upcoming tasks as we move through the next days. Day 1 established the API contract, gateway protections, Prisma/PostgreSQL foundation, assigned Frappe DocTypes, ERP health endpoint, and automated verification. Please review the isolated Fitness/Coding Work folder and the Day 1 branch first. We will follow the documented day-by-day plan and will not take up another teammate’s work or add new architecture.”</Text>
          </CardBody>
        </Card>

        <div style={{ paddingTop: 4 }}>
          <Text color="tertiary">Suggested presentation order: scope boundary → flow → completed areas → database/API-key Q&A → tests → Yashwanth handoff.</Text>
        </div>
      </Stack>
    </div>
  );
}
