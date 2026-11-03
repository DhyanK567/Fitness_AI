'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Button,
  IconButton,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Avatar,
  Tooltip,
  Tabs,
  Breadcrumbs,
  Modal,
  Drawer,
  Dropdown,
  Popover,
  DataTable,
  Pagination,
  SearchField,
  FilterBar,
  StatCard,
  Alert,
  ConfirmationDialog,
  useToast,
  PageHeader,
  SectionHeader,
  FormSection,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  UserPlusIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  CreditCardIcon,
  BellIcon,
  SettingsIcon,
  SparklesIcon,
  DumbbellIcon,
  MapPinIcon,
  IndianRupeeIcon,
} from '@/components/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionDenied } from '@/components/feedback/PermissionDenied';

interface DemoMember {
  id: string;
  name: string;
  phone: string;
  plan: string;
  status: 'active' | 'expiring' | 'expired';
  attendanceCount: number;
}

const demoMembers: DemoMember[] = [
  {
    id: 'MEM-001',
    name: 'Ananya Sharma',
    phone: '+91 98765 43210',
    plan: 'Unlimited Yoga VIP',
    status: 'active',
    attendanceCount: 18,
  },
  {
    id: 'MEM-002',
    name: 'Rohan Mehra',
    phone: '+91 98111 22334',
    plan: 'Zumba 12-Class Pack',
    status: 'expiring',
    attendanceCount: 11,
  },
  {
    id: 'MEM-003',
    name: 'Priya Patel',
    phone: '+91 97222 33445',
    plan: 'Contemporary Dance Pro',
    status: 'active',
    attendanceCount: 24,
  },
  {
    id: 'MEM-004',
    name: 'Kabir Verma',
    phone: '+91 99333 44556',
    plan: 'Trial Session Pass',
    status: 'expired',
    attendanceCount: 1,
  },
];

export default function DesignSystemShowcase() {
  const { addToast } = useToast();

  // Interactive Demo States
  const [activeTab, setActiveTab] = useState('components');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState(false);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState('yoga');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredMembers = demoMembers.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.plan.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-sand-50 dark:bg-studio-950 text-sand-900 dark:text-sand-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-sand-200 dark:border-studio-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-9 w-9 rounded-xl bg-primary-600 flex items-center justify-center font-extrabold text-white text-lg shadow-sm">
                W
              </span>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-sand-950 dark:text-white">
                  Wellness Studio OS — Design System
                </h1>
                <p className="text-xs text-sand-500 dark:text-sand-400">
                  Danza-inspired typography, wellness palette, elevation, and SaaS component foundation
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="outline" size="sm">
                Back to Landing
              </Button>
            </Link>
            <Button
              variant="luxury"
              size="sm"
              onClick={() =>
                addToast({
                  type: 'success',
                  title: 'Design System Verified',
                  message: 'Phase 1 tokens and UI primitives are loaded with Danza visual aesthetics.',
                })
              }
            >
              Test Toast
            </Button>
          </div>
        </div>

        {/* Section Tabs */}
        <Tabs
          variant="segment"
          activeTab={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'components', label: 'Component Primitives' },
            { id: 'feedback', label: 'UI Feedback States' },
            { id: 'danza-preview', label: 'Fitness AI Composition' },
            { id: 'tokens', label: 'Color & Typography Tokens' },
          ]}
        />

        {/* TAB 1: COMPONENT PRIMITIVES */}
        {activeTab === 'components' && (
          <div className="space-y-10">
            {/* Buttons & IconButtons */}
            <Card>
              <CardHeader>
                <CardTitle>Buttons &amp; Actions</CardTitle>
                <CardDescription>
                  Supported variants: Primary (Teal), Secondary (Coral/Terracotta), Outline, Ghost, Danger, and Luxury.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" leftIcon={<CalendarIcon size="sm" />}>
                    Primary Action
                  </Button>
                  <Button variant="secondary" leftIcon={<SparklesIcon size="sm" />}>
                    Secondary Coral
                  </Button>
                  <Button variant="luxury" leftIcon={<IndianRupeeIcon size="sm" />}>
                    VIP Luxury Pass
                  </Button>
                  <Button variant="outline">Outline Button</Button>
                  <Button variant="ghost">Ghost Button</Button>
                  <Button variant="danger" leftIcon={<AlertTriangleIcon size="sm" />}>
                    Danger Button
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-sand-100 dark:border-studio-800">
                  <span className="text-xs font-semibold text-sand-500 uppercase tracking-wider mr-2">
                    Sizes &amp; States:
                  </span>
                  <Button size="xs" variant="primary">
                    Extra Small
                  </Button>
                  <Button size="sm" variant="primary">
                    Small
                  </Button>
                  <Button size="md" variant="primary">
                    Medium
                  </Button>
                  <Button size="lg" variant="primary">
                    Large Button
                  </Button>
                  <Button variant="primary" isLoading>
                    Loading
                  </Button>
                  <Button variant="primary" disabled>
                    Disabled
                  </Button>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-sand-100 dark:border-studio-800">
                  <span className="text-xs font-semibold text-sand-500 uppercase tracking-wider mr-2">
                    Icon Buttons:
                  </span>
                  <Tooltip content="Studio Bell Notification">
                    <IconButton variant="outline" icon={<BellIcon size="sm" />} aria-label="Notifications" />
                  </Tooltip>
                  <Tooltip content="Settings Center">
                    <IconButton variant="ghost" icon={<SettingsIcon size="sm" />} aria-label="Settings" />
                  </Tooltip>
                  <Tooltip content="Add New Member">
                    <IconButton variant="primary" icon={<UserPlusIcon size="sm" />} aria-label="Add Member" />
                  </Tooltip>
                </div>
              </CardContent>
            </Card>

            {/* Form Inputs & Controls */}
            <Card>
              <CardHeader>
                <CardTitle>Form Inputs &amp; Controls</CardTitle>
                <CardDescription>
                  Inputs with icons, validation errors, select dropdowns, checkboxes, and toggle switches.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Input
                  label="Member Name"
                  placeholder="e.g. Ananya Sharma"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  helperText="Enter member full legal name"
                />

                <Input
                  label="Phone Number"
                  placeholder="+91 98765 43210"
                  prefixIcon={<span className="text-xs font-semibold text-sand-500">+91</span>}
                  error={inputError ? 'Invalid phone number format' : undefined}
                />

                <Select
                  label="Membership Plan"
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  options={[
                    { value: 'yoga', label: 'Unlimited Yoga VIP (₹4,500/mo)' },
                    { value: 'zumba', label: 'Zumba Cardio Pack (₹3,200/mo)' },
                    { value: 'dance', label: 'Contemporary Dance Pro (₹5,000/mo)' },
                  ]}
                />

                <div className="space-y-4">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-sand-700 dark:text-sand-300">
                    Toggles &amp; Checkboxes
                  </span>
                  <Switch
                    checked={switchChecked}
                    onChange={setSwitchChecked}
                    label="Auto-Renewal WhatsApp Alert"
                    description="Send reminder 3 days prior"
                  />
                  <Checkbox
                    checked={checkboxChecked}
                    onChange={(e) => setCheckboxChecked(e.target.checked)}
                    label="WhatsApp Consent Agreement"
                    sublabel="Opt-in for class reminders and updates"
                  />
                </div>

                <div className="md:col-span-2">
                  <Textarea
                    label="Medical Notes / Physical Limitations"
                    placeholder="e.g. Previous knee injury, prefers gentle modifications..."
                    rows={3}
                    characterCount={45}
                    maxCharacters={250}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInputError(!inputError)}
                >
                  Toggle Error State
                </Button>
              </CardFooter>
            </Card>

            {/* Badges, Avatars & Tags */}
            <Card>
              <CardHeader>
                <CardTitle>Badges &amp; Avatars</CardTitle>
                <CardDescription>
                  Semantic status pills, VIP luxury tags, and user initials/images with presence indicators.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="success" dot>Confirmed</Badge>
                  <Badge variant="warning" dot>Waitlisted (2)</Badge>
                  <Badge variant="danger" dot>Cancelled</Badge>
                  <Badge variant="primary">Active Pass</Badge>
                  <Badge variant="secondary">Hot Session</Badge>
                  <Badge variant="luxury">VIP Gold Member</Badge>
                  <Badge variant="neutral">Trial Lead</Badge>
                </div>

                <div className="flex items-center gap-4 pt-3 border-t border-sand-100 dark:border-studio-800">
                  <Avatar name="Ananya Sharma" size="lg" status="online" />
                  <Avatar name="Rohan Mehra" size="md" status="busy" />
                  <Avatar name="Priya Patel" size="md" status="online" />
                  <Avatar name="Kabir Verma" size="sm" status="offline" />
                  <Avatar name="Studio Desk" size="xs" />
                </div>
              </CardContent>
            </Card>

            {/* Interactive Overlays (Modal, Drawer, Dialog) */}
            <Card>
              <CardHeader>
                <CardTitle>Overlays &amp; Dialogs</CardTitle>
                <CardDescription>
                  Accessible modals, slide-over detail drawers, dropdowns, and confirmation prompts.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-4">
                <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                  Open Studio Modal
                </Button>
                <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
                  Open Member 360 Drawer
                </Button>
                <Button variant="danger" onClick={() => setIsConfirmOpen(true)}>
                  Open Confirmation Dialog
                </Button>

                <Dropdown
                  trigger={
                    <Button variant="outline">
                      Action Dropdown ▾
                    </Button>
                  }
                  items={[
                    { id: '1', label: 'View Profile', icon: <UsersIcon size="xs" /> },
                    { id: '2', label: 'Renew Membership', icon: <CreditCardIcon size="xs" /> },
                    { id: 'div', label: '', divider: true },
                    { id: '3', label: 'Cancel Booking', destructive: true, icon: <AlertTriangleIcon size="xs" /> },
                  ]}
                />

                <Popover
                  trigger={
                    <Button variant="ghost">
                      Quick Info Popover ⓘ
                    </Button>
                  }
                  content={
                    <div>
                      <h5 className="font-bold text-sm text-sand-900 dark:text-white">Studio Policy</h5>
                      <p className="text-xs text-sand-500 mt-1 leading-relaxed">
                        Cancellations must be made at least 4 hours before session start to avoid pass deduction.
                      </p>
                    </div>
                  }
                />
              </CardContent>
            </Card>

            {/* Data Table & Filtering */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>Studio Data Table</CardTitle>
                    <CardDescription>
                      Structured table with search, status badges, density support, and pagination.
                    </CardDescription>
                  </div>
                  <SearchField
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search member or plan..."
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <DataTable
                  columns={[
                    {
                      key: 'id',
                      header: 'Member ID',
                      className: 'font-mono text-xs text-sand-500',
                    },
                    {
                      key: 'name',
                      header: 'Member',
                      render: (item) => (
                        <div className="flex items-center gap-2.5">
                          <Avatar name={item.name} size="sm" />
                          <div>
                            <span className="font-semibold block leading-tight">{item.name}</span>
                            <span className="text-xs text-sand-500">{item.phone}</span>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: 'plan',
                      header: 'Plan Tier',
                      render: (item) => <span className="font-medium">{item.plan}</span>,
                    },
                    {
                      key: 'attendanceCount',
                      header: 'Attended',
                      align: 'center',
                      render: (item) => (
                        <span className="font-semibold px-2 py-0.5 rounded bg-sand-100 dark:bg-studio-800 text-xs">
                          {item.attendanceCount} sessions
                        </span>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      align: 'right',
                      render: (item) => {
                        const variant =
                          item.status === 'active'
                            ? 'success'
                            : item.status === 'expiring'
                            ? 'warning'
                            : 'danger';
                        return (
                          <Badge variant={variant} dot>
                            {item.status.toUpperCase()}
                          </Badge>
                        );
                      },
                    },
                  ]}
                  data={filteredMembers}
                  keyExtractor={(item) => item.id}
                />

                <Pagination
                  currentPage={currentPage}
                  totalPages={3}
                  totalItems={28}
                  pageSize={10}
                  onPageChange={setCurrentPage}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 2: UI FEEDBACK STATES */}
        {activeTab === 'feedback' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Alert variant="info" title="Scheduled Maintenance Notice">
                System will perform automated nightly outbox reconciliation at 02:00 AM IST.
              </Alert>
              <Alert variant="success" title="Razorpay Webhook Verified">
                Payment receipt #INV-9281 successfully posted to Frappe ledger.
              </Alert>
              <Alert variant="warning" title="Approaching Studio Capacity">
                6:30 PM Zumba class has 2 remaining seats before waitlist triggers.
              </Alert>
              <Alert variant="danger" title="Message Delivery Timeout">
                WhatsApp Cloud API webhook returned timeout for recipient +91 98765 00000.
              </Alert>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <EmptyState
                title="No Upcoming Bookings"
                description="This member has not reserved any class sessions for the current week. Explore the schedule to book a spot."
                actionLabel="Browse Class Schedule"
                onAction={() =>
                  addToast({ type: 'info', message: 'Navigating to schedule...' })
                }
              />

              <ErrorState
                title="Failed to Load Studio Ledger"
                message="ERPNext Frappe adapter connection timed out while querying membership records."
                correlationId="REQ-9182-ERP-TX"
                onRetry={() =>
                  addToast({ type: 'info', message: 'Retrying adapter query...' })
                }
              />
            </div>

            <div>
              <SectionHeader
                title="Permission Denied (403)"
                description="Visual fallback when a Trainer or Front Desk attempts to access Owner-only configuration settings."
              />
              <PermissionDenied
                requiredRole="Studio Owner"
                currentRole="Front Desk Staff"
                backUrl="/design-system"
              />
            </div>

            <div>
              <SectionHeader
                title="Loading Skeletons (Shimmer State)"
                description="Zero-layout-shift skeletons while awaiting Next.js SSR / API data."
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <LoadingState variant="card" />
                <LoadingState variant="card" />
                <LoadingState variant="card" />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DANZA STUDIO COMPOSITION */}
        {activeTab === 'danza-preview' && (
          <div className="space-y-8">
            <SectionHeader
              title="Fitness AI Session Cards"
              description="Visual composition combining bold display typography, vibrant energy accents, seat availability indicators, and booking actions."
            />

            {/* Stat KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Today's Check-ins"
                value="48 / 65"
                icon={<UsersIcon size="md" />}
                change={{ value: '+14% vs yesterday', trend: 'up' }}
              />
              <StatCard
                title="Active Memberships"
                value="312"
                icon={<SparklesIcon size="md" />}
                change={{ value: '+8 this week', trend: 'up' }}
                variant="primary"
              />
              <StatCard
                title="Class Occupancy"
                value="88.4%"
                icon={<DumbbellIcon size="md" />}
                change={{ value: 'Above target (80%)', trend: 'up' }}
              />
              <StatCard
                title="Monthly Revenue"
                value="₹4,82,500"
                icon={<IndianRupeeIcon size="md" />}
                change={{ value: '+22.5% MoM', trend: 'up' }}
                variant="luxury"
              />
            </div>

            {/* Studio Class Schedule Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Open session */}
              <Card variant="interactive" className="group">
                <div className="relative h-44 bg-gradient-to-tr from-studio-950 to-primary-950/70 p-5 flex flex-col justify-between overflow-hidden">
                  <div className="flex justify-between items-start z-10">
                    <Badge variant="primary" dot>YOGA FLOW</Badge>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-black/40 text-emerald-300 backdrop-blur-sm border border-emerald-500/30">
                      4 Spots Left
                    </span>
                  </div>
                  <div className="z-10">
                    <h4 className="text-xl font-extrabold text-white group-hover:text-primary-300 transition-colors">
                      Morning Vinyasa &amp; Pranayama
                    </h4>
                    <p className="text-xs text-sand-300 mt-1 flex items-center gap-1.5">
                      <ClockIcon size="xs" /> 07:00 AM – 08:15 AM &bull; Studio Studio A
                    </p>
                  </div>
                  <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary-600/20 rounded-full blur-2xl pointer-events-none" />
                </div>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-sand-500">
                    <div className="flex items-center gap-2">
                      <Avatar name="Meera Sen" size="sm" />
                      <div>
                        <span className="font-semibold text-sand-900 dark:text-white block">Meera Sen</span>
                        <span>Senior Ashtanga Lead</span>
                      </div>
                    </div>
                    <span className="font-bold text-primary-600 dark:text-primary-400">75 Mins</span>
                  </div>
                  {/* Capacity Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-sand-500">
                      <span>Booked: 16/20</span>
                      <span className="text-emerald-500">80% Full</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-sand-200 dark:bg-studio-800 overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full w-[80%]" />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      addToast({
                        type: 'success',
                        title: 'Spot Reserved',
                        message: 'Booked Morning Vinyasa for tomorrow at 07:00 AM.',
                      })
                    }
                  >
                    Reserve Session
                  </Button>
                </CardFooter>
              </Card>

              {/* Card 2: Hot high energy */}
              <Card variant="interactive" className="group">
                <div className="relative h-44 bg-gradient-to-tr from-studio-950 to-secondary-950/70 p-5 flex flex-col justify-between overflow-hidden">
                  <div className="flex justify-between items-start z-10">
                    <Badge variant="secondary" dot>ZUMBA PARTY</Badge>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary-500/20 text-secondary-300 backdrop-blur-sm border border-secondary-500/30">
                      Only 1 Spot Left!
                    </span>
                  </div>
                  <div className="z-10">
                    <h4 className="text-xl font-extrabold text-white group-hover:text-secondary-300 transition-colors">
                      Latin Beats &amp; High-Cardio
                    </h4>
                    <p className="text-xs text-sand-300 mt-1 flex items-center gap-1.5">
                      <ClockIcon size="xs" /> 06:30 PM – 07:30 PM &bull; Main Floor
                    </p>
                  </div>
                  <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-secondary-600/20 rounded-full blur-2xl pointer-events-none" />
                </div>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-sand-500">
                    <div className="flex items-center gap-2">
                      <Avatar name="Carlos Diaz" size="sm" />
                      <div>
                        <span className="font-semibold text-sand-900 dark:text-white block">Carlos Diaz</span>
                        <span>Certified Zumba Jammer</span>
                      </div>
                    </div>
                    <span className="font-bold text-secondary-600 dark:text-secondary-400">60 Mins</span>
                  </div>
                  {/* Capacity Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-sand-500">
                      <span>Booked: 29/30</span>
                      <span className="text-secondary-500 font-bold">96% Full</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-sand-200 dark:bg-studio-800 overflow-hidden">
                      <div className="h-full bg-secondary-500 rounded-full w-[96%]" />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      addToast({
                        type: 'success',
                        title: 'Last Seat Secured!',
                        message: 'Booked Latin Beats Zumba at 06:30 PM.',
                      })
                    }
                  >
                    Grab Last Seat
                  </Button>
                </CardFooter>
              </Card>

              {/* Card 3: VIP Luxury Workshop */}
              <Card variant="luxury" className="group">
                <div className="relative h-44 p-5 flex flex-col justify-between overflow-hidden">
                  <div className="flex justify-between items-start z-10">
                    <Badge variant="luxury">MASTERCLASS</Badge>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent-500/10 text-accent-400 border border-accent-500/20">
                      ₹1,499 Entry
                    </span>
                  </div>
                  <div className="z-10">
                    <h4 className="text-xl font-extrabold text-white group-hover:text-accent-300 transition-colors">
                      Acro-Yoga &amp; Partner Dynamics
                    </h4>
                    <p className="text-xs text-sand-400 mt-1 flex items-center gap-1.5">
                      <CalendarIcon size="xs" /> Saturday, Oct 4 &bull; 04:00 PM – 07:00 PM
                    </p>
                  </div>
                </div>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-sand-400">
                    <div className="flex items-center gap-2">
                      <Avatar name="Aarav Kapoor" size="sm" />
                      <div>
                        <span className="font-semibold text-white block">Aarav &amp; Tara</span>
                        <span>Guest Master Instructors</span>
                      </div>
                    </div>
                    <span className="font-bold text-accent-400">3 Hours</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-sand-400">
                      <span>Limited: 18/25 Registered</span>
                      <span className="text-accent-400">72% Taken</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-studio-800 overflow-hidden">
                      <div className="h-full bg-accent-500 rounded-full w-[72%]" />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="luxury"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      addToast({
                        type: 'info',
                        title: 'Workshop Registration',
                        message: 'Razorpay checkout will launch in Phase 7.',
                      })
                    }
                  >
                    Register Workshop Ticket
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 4: COLOR & TYPOGRAPHY TOKENS */}
        {activeTab === 'tokens' && (
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Design Token Palette</CardTitle>
                <CardDescription>
                  Exact hex codes matching the Wellness Studio OS Danza specification.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-sand-500 mb-3">
                    Primary: Forest &amp; Deep Teal
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { shade: 'primary-500', hex: '#14B8A6' },
                      { shade: 'primary-600', hex: '#0D9488' },
                      { shade: 'primary-700', hex: '#0F766E' },
                      { shade: 'primary-800', hex: '#115E59' },
                      { shade: 'primary-950', hex: '#042F2C' },
                    ].map((c) => (
                      <div key={c.shade} className="p-3 rounded-xl border border-sand-200 dark:border-studio-700">
                        <div
                          className="h-10 rounded-lg mb-2 shadow-sm"
                          style={{ backgroundColor: c.hex }}
                        />
                        <span className="font-semibold text-xs block">{c.shade}</span>
                        <span className="font-mono text-[10px] text-sand-500">{c.hex}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-sand-500 mb-3">
                    Secondary: Danza Terracotta &amp; Coral Energy
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { shade: 'secondary-400', hex: '#FB923C' },
                      { shade: 'secondary-500', hex: '#F97316' },
                      { shade: 'secondary-600', hex: '#EA580C' },
                      { shade: 'secondary-700', hex: '#C2410C' },
                      { shade: 'secondary-900', hex: '#7C2D12' },
                    ].map((c) => (
                      <div key={c.shade} className="p-3 rounded-xl border border-sand-200 dark:border-studio-700">
                        <div
                          className="h-10 rounded-lg mb-2 shadow-sm"
                          style={{ backgroundColor: c.hex }}
                        />
                        <span className="font-semibold text-xs block">{c.shade}</span>
                        <span className="font-mono text-[10px] text-sand-500">{c.hex}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-sand-500 mb-3">
                    Accent: Warm Amber &amp; Gold
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { shade: 'accent-400', hex: '#FBBF24' },
                      { shade: 'accent-500', hex: '#F59E0B' },
                      { shade: 'accent-600', hex: '#D97706' },
                    ].map((c) => (
                      <div key={c.shade} className="p-3 rounded-xl border border-sand-200 dark:border-studio-700">
                        <div
                          className="h-10 rounded-lg mb-2 shadow-sm"
                          style={{ backgroundColor: c.hex }}
                        />
                        <span className="font-semibold text-xs block">{c.shade}</span>
                        <span className="font-mono text-[10px] text-sand-500">{c.hex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Interactive Modals and Drawers */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Studio Quick Reservation"
          description="Book a member into an upcoming session directly from the front desk."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsModalOpen(false);
                  addToast({ type: 'success', message: 'Member reserved successfully!' });
                }}
              >
                Confirm Booking
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input label="Search Member" placeholder="Enter name or mobile number..." />
            <Select
              label="Select Session"
              options={[
                { value: '1', label: 'Tomorrow, 07:00 AM — Morning Vinyasa (Studio A)' },
                { value: '2', label: 'Tomorrow, 06:30 PM — Latin Zumba (Main Floor)' },
              ]}
            />
            <Checkbox label="Send WhatsApp instant confirmation" checked readOnly />
          </div>
        </Modal>

        <Drawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title="Member 360: Ananya Sharma"
          description="Detailed member profile, active pass balance, and attendance history."
          footer={
            <Button variant="primary" size="sm" onClick={() => setIsDrawerOpen(false)}>
              Done Viewing
            </Button>
          }
        >
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-sand-100 dark:bg-studio-800">
              <Avatar name="Ananya Sharma" size="lg" status="online" />
              <div>
                <h4 className="font-bold text-base">Ananya Sharma</h4>
                <p className="text-xs text-sand-500">+91 98765 43210 &bull; Member since Jan 2026</p>
                <Badge variant="luxury" size="sm" className="mt-1.5">
                  Unlimited Yoga VIP
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-sand-500">
                Membership Health
              </h5>
              <div className="p-4 rounded-xl border border-sand-200 dark:border-studio-800 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Pass Validity:</span>
                  <strong className="text-emerald-500">Valid till 15 Nov 2026</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Sessions Completed:</span>
                  <span className="font-semibold">18 Classes</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Last Attendance:</span>
                  <span className="text-sand-500">Yesterday, 07:00 AM</span>
                </div>
              </div>
            </div>
          </div>
        </Drawer>

        <ConfirmationDialog
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={() => {
            setIsConfirmOpen(false);
            addToast({ type: 'warning', message: 'Booking was successfully cancelled.' });
          }}
          title="Cancel Class Booking?"
          message="Are you sure you want to cancel this booking? Since this is within 4 hours of class start, 1 pass session will be deducted per studio rules."
          confirmLabel="Cancel Booking"
        />
      </div>
    </div>
  );
}
