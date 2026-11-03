'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import {
  UserPlus,
  Search,
  Phone,
  Mail,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Trash2,
  RefreshCw,
  X,
} from 'lucide-react';

interface LeadItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  planInterest: string;
  createdAt: string;
  notes?: string;
}

export default function StaffLeadsPage() {
  const { addToast } = useToast();
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [displayCount, setDisplayCount] = useState(8);
  const [plans, setPlans] = useState<string[]>(['Monthly Flex', 'Quarterly Pro', 'Annual Elite', 'Personal Training']);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    plan: 'Monthly Flex',
    source: 'Walk-in',
    notes: '',
  });

  async function loadData() {
    setLoading(true);
    try {
      // Fetch leads and memberships
      const [leadsRes, plansRes] = await Promise.allSettled([
        ApiClient.getLeads(),
        ApiClient.getMemberships(),
      ]);

      if (leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value)) {
        setLeads(leadsRes.value);
      }
      if (plansRes.status === 'fulfilled' && Array.isArray(plansRes.value) && plansRes.value.length > 0) {
        setPlans(plansRes.value.map((p) => p.name));
        if (plansRes.value[0]?.name) {
          setFormData((prev) => ({ ...prev, plan: plansRes.value[0].name }));
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      addToast({ type: 'error', title: 'Required Fields', message: 'Name and Phone number are required.' });
      return;
    }

    setSubmitting(true);
    try {
      await ApiClient.createFrontDeskWalkInLead({
        full_name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        plan: formData.plan,
        notes: `Source: ${formData.source}. ${formData.notes}`.trim(),
      });

      addToast({
        type: 'success',
        title: 'Lead Captured',
        message: `${formData.name} added to CRM with follow-up status New.`,
      });

      setIsModalOpen(false);
      setFormData({
        name: '',
        phone: '',
        email: '',
        plan: plans[0] || 'Monthly Flex',
        source: 'Walk-in',
        notes: '',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Creating Lead',
        message: err.message || 'Unable to record lead.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      const mappedStatus = newStatus.toLowerCase().replace(/\s+/g, '-') as any;
      await ApiClient.updateLead(id, { status: mappedStatus });
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
      addToast({ type: 'success', title: 'Status Updated', message: `Lead updated to ${newStatus}.` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Update Failed', message: err.message || 'Failed to update lead status.' });
    }
  }

  async function handleDeleteLead(id: string) {
    if (!confirm('Are you sure you want to remove this lead?')) return;
    try {
      await ApiClient.deleteLead(id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      addToast({ type: 'success', title: 'Lead Removed', message: 'The lead has been removed from CRM.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Delete Failed', message: err.message || 'Failed to delete lead.' });
    }
  }

  const filteredLeads = useMemo(() => {
    return leads.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.phone.toLowerCase().includes(search.toLowerCase()) ||
        item.email.toLowerCase().includes(search.toLowerCase()) ||
        item.planInterest?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === 'All' || item.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const pagedLeads = useMemo(() => {
    return filteredLeads.slice(0, displayCount);
  }, [filteredLeads, displayCount]);

  const totalWalkIns = useMemo(() => {
    return leads.filter((l) => l.source?.toLowerCase().includes('walk-in') || l.source?.toLowerCase().includes('desk')).length;
  }, [leads]);

  const convertedCount = useMemo(() => {
    return leads.filter((l) => l.status?.toLowerCase() === 'converted' || l.status?.toLowerCase() === 'won').length;
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Walk-in &amp; CRM Leads
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Capture prospective member walk-ins, track enquiries, and schedule studio trials.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition hover:from-rose-700 hover:to-rose-600"
          >
            <UserPlus className="size-4" />
            Capture Walk-in Lead
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Enquiries</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{leads.length}</span>
            <span className="text-xs font-bold text-blue-600">Active Pipeline</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">All registered front desk and online leads</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Front Desk Walk-ins</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{totalWalkIns}</span>
            <span className="text-xs font-bold text-emerald-600">Direct Inquiries</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Captured in-person at reception desk</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Converted Members</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{convertedCount}</span>
            <span className="text-xs font-bold text-rose-600">
              {leads.length > 0 ? `${Math.round((convertedCount / leads.length) * 100)}%` : '0%'} Rate
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Turned into paid active memberships</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-studio-800 dark:bg-studio-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads by name, phone, email, or plan..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setDisplayCount(8);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-800 dark:text-white dark:focus:border-rose-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['All', 'New', 'Contacted', 'Trial Scheduled', 'Converted', 'Lost'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setDisplayCount(8);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === st
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-studio-800 dark:text-slate-300 dark:hover:bg-studio-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Leads Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-studio-800 dark:bg-studio-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-600 dark:border-studio-800 dark:bg-studio-950 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3">Lead Name</th>
                <th className="px-6 py-3">Contact Details</th>
                <th className="px-6 py-3">Interested Plan</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">Stage / Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
              {pagedLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400">
                    No leads found matching your search criteria.
                  </td>
                </tr>
              ) : (
                pagedLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/50 dark:hover:bg-studio-800/40">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{lead.name}</div>
                      <div className="text-[11px] text-slate-400">Added: {lead.createdAt?.slice(0, 10)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-mono text-xs text-slate-800 dark:text-slate-200">
                        <Phone className="size-3 text-slate-400" />
                        {lead.phone}
                      </div>
                      {lead.email && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Mail className="size-3 text-slate-400" />
                          {lead.email}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-studio-800 dark:text-slate-200">
                        {lead.planInterest || 'Standard Plan'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {lead.source || 'Walk-in'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={lead.status}
                        onChange={(e) => void handleStatusChange(lead.id, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200"
                      >
                        <option value="New">New</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Trial Scheduled">Trial Scheduled</option>
                        <option value="Converted">Converted</option>
                        <option value="Lost">Lost</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDeleteLead(lead.id)}
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        title="Delete Lead"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Lazy Loading 8 + See More */}
        {filteredLeads.length > displayCount && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 dark:border-studio-800 dark:bg-studio-950">
            <span className="text-xs text-slate-500">
              Showing {pagedLeads.length} of {filteredLeads.length} leads
            </span>
            <button
              type="button"
              onClick={() => setDisplayCount((prev) => prev + 8)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200"
            >
              See More (+8)
            </button>
          </div>
        )}
      </div>

      {/* Capture Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-studio-800 dark:bg-studio-900 sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-studio-800">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                  <UserPlus className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Capture Walk-in Lead</h3>
                  <p className="text-xs text-slate-400">Record visitor enquiry at front desk console</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-studio-800"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Phone Number (10 digits) *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="rahul@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Interested Plan
                  </label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                  >
                    {plans.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Enquiry Source
                  </label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                  >
                    <option value="Walk-in">Walk-in</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="Referral">Member Referral</option>
                    <option value="Instagram / Social">Instagram / Social</option>
                    <option value="Google Maps">Google Maps</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Notes &amp; Fitness Goals
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Wants morning slots for fat loss; requested 2-day trial."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300 dark:hover:bg-studio-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:from-rose-700 hover:to-rose-600 disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Save & Track Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
