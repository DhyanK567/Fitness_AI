'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { useToast } from '@/components/ui/Toast';
import { CheckIcon } from '@/components/ui/icons';
import { ApiClient } from '@/lib/api-client';

export default function EnquiryPage() {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [studio, setStudio] = useState('Indiranagar');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await ApiClient.createPublicEnquiry({
        full_name: name,
        phone,
        email: email || undefined,
      });
      setSubmitted(true);
      addToast({
        type: 'success',
        title: 'Enquiry Received',
        message: `Thank you ${name}. Our studio concierge will contact you via WhatsApp at ${phone}.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Submission Failed',
        message: err?.message || 'Could not submit your enquiry. Please verify your information and try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FCFAF8] text-slate-800 flex flex-col font-sans">
      <PublicNavbar activeSection="contact" />

      <main className="flex-1 py-12 lg:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200/80 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-700 via-[#E11D48] to-slate-900" />

            <span className="text-xs uppercase tracking-[0.22em] font-bold text-[#E11D48] font-sans block mb-1">
              STUDIO CONCIERGE &amp; TRIAL PASS
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
              Connect with Fitness AI
            </h1>
            <p className="text-slate-600 text-sm mb-8">
              Enquire about memberships, private studio bookings, trial passes, or corporate wellness sessions.
            </p>

            <div className="relative mb-8 h-40 overflow-hidden rounded-2xl bg-slate-100 sm:h-48">
              <Image src="https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1200&q=80" alt="Members practicing yoga in a bright studio" fill className="object-cover" sizes="(max-width: 768px) 100vw, 680px" />
            </div>

            {submitted ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 rounded-full bg-rose-50 text-[#E11D48] flex items-center justify-center mx-auto shadow-inner">
                  <CheckIcon className="w-8 h-8" />
                </div>
                <h2 className="font-serif text-2xl font-bold text-slate-900">Enquiry Submitted!</h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Our front desk concierge will connect with you on WhatsApp at <strong>{phone}</strong> shortly.
                </p>
                <Link
                  href="/"
                  className="inline-block mt-4 px-6 py-2.5 rounded-full bg-[#E11D48] text-white text-xs uppercase font-bold tracking-wider hover:bg-[#BE123C] transition shadow-xs"
                >
                  Return to Homepage &rarr;
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Radhika Sharma"
                    suppressHydrationWarning
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      WhatsApp Mobile Number
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      suppressHydrationWarning
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="radhika@gmail.com"
                      suppressHydrationWarning
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Sanctuary Location
                  </label>
                  <select
                    value={studio}
                    onChange={(e) => setStudio(e.target.value)}
                    suppressHydrationWarning
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                  >
                    <option value="Indiranagar">Indiranagar, Bengaluru</option>
                    <option value="Bandra">Bandra West, Mumbai</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    How Can We Support Your Practice?
                  </label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your wellness goals, previous practice experience, or preferred schedule..."
                    suppressHydrationWarning
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                  />
                </div>

                {/* Danza Double-Box Outline Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    suppressHydrationWarning
                    className="w-full py-3.5 text-center text-xs uppercase tracking-widest font-semibold text-[#E11D48] border border-[#E11D48] outline outline-1 outline-[#E11D48] outline-offset-4 hover:bg-[#E11D48] hover:text-white transition-all duration-300 disabled:opacity-50 shadow-xs"
                  >
                    {loading ? 'SENDING ENQUIRY...' : 'SUBMIT TRIAL ENQUIRY'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
