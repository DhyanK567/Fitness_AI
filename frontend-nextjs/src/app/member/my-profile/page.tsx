'use client';

import React, { useState } from 'react';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { UserIcon, PhoneIcon, MailIcon, ShieldCheckIcon, CheckIcon } from '@/components/ui/icons';

export default function MemberProfilePage() {
  const { user, updateUser } = useAuthContext();
  const { addToast } = useToast();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [emergencyContact, setEmergencyContact] = useState('9876500000');
  const [preferredStudio, setPreferredStudio] = useState('Indiranagar Sanctuary');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser({ name, phone, email });
    addToast({
      type: 'success',
      title: 'Profile Updated',
      message: 'Your practitioner details have been saved.',
    });
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm flex items-center gap-6">
        <img
          src={user?.avatarUrl}
          alt={user?.name}
          className="w-20 h-20 rounded-full object-cover border-4 border-[#E11D48] shadow-md flex-shrink-0"
        />
        <div>
          <span className="text-xs uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-1">
            PRACTITIONER ACCOUNT
          </span>
          <h1 className="font-serif text-3xl font-bold text-slate-900">{user?.name}</h1>
          <p className="text-xs text-slate-500 mt-1">
            Member ID: <strong className="font-mono text-slate-800">{user?.memberId}</strong> &bull; Sanctuary Member since {user?.joinedDate}
          </p>
        </div>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-sm space-y-6">
        <h2 className="font-serif text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">
          Personal Information &amp; Contact Details
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-2">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-2">WhatsApp Mobile Number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-2">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-2">Emergency Contact</label>
            <input
              type="tel"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-2">Home Studio Sanctuary</label>
          <select
            value={preferredStudio}
            onChange={(e) => setPreferredStudio(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="Indiranagar Sanctuary">Indiranagar Sanctuary &bull; Bengaluru</option>
            <option value="Bandra Sanctuary">Bandra Sanctuary &bull; Mumbai</option>
          </select>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="submit"
            className="px-6 py-3 rounded-full bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs uppercase tracking-wider transition shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
