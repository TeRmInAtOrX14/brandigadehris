import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import {
  FileText,
  Clock,
  Plus,
  X,
  User,
  Loader2,
  FileCheck
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Requests() {
  const [activeTab, setActiveTab] = useState('my-requests');
  const [leaves, setLeaves] = useState([]);
  const [halfdays, setHalfdays] = useState([]);
  const [wfhs, setWfhs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitType, setSubmitType] = useState('leave');

  const currentUser = JSON.parse(localStorage.getItem('user')) || { role: 'Employee' };
  const isReviewer = ['Admin', 'CEO', 'COO', 'Team Lead'].includes(currentUser.role);
  const { register, handleSubmit, reset } = useForm();

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const query = activeTab === 'reviews' ? 'status=pending' : '';
      
      const leaveRes = await api.get(`/requests/leave?${query}`);
      const halfRes = await api.get(`/requests/halfday?${query}`);
      const wfhRes = await api.get(`/requests/wfh?${query}`);

      setLeaves(leaveRes.data);
      setHalfdays(halfRes.data);
      setWfhs(wfhRes.data);
    } catch (e) {
      toast.error('Failed to load requests log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [activeTab]);

  const handleCreateRequest = async (data) => {
    try {
      let endpoint = '';
      if (submitType === 'leave') endpoint = '/requests/leave';
      if (submitType === 'halfday') endpoint = '/requests/halfday';
      if (submitType === 'wfh') endpoint = '/requests/wfh';

      await api.post(endpoint, data);
      toast.success('Request submitted successfully!');
      setSubmitModalOpen(false);
      reset();
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit request');
    }
  };

  const handleReview = async (id, type, status) => {
    try {
      let endpoint = '';
      if (type === 'leave') endpoint = `/requests/leave/${id}/review`;
      if (type === 'halfday') endpoint = `/requests/halfday/${id}/review`;
      if (type === 'wfh') endpoint = `/requests/wfh/${id}/review`;

      await api.put(endpoint, { status });
      toast.success(`Request ${status} successfully!`);
      fetchRequests();
    } catch (err) {
      toast.error('Failed to review request');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold bg-brand-green/10 text-brand-green border border-brand-green/20 uppercase tracking-wider">Approved</span>;
      case 'rejected':
        return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold bg-brand-amber/10 text-brand-amber border border-brand-amber/20 uppercase tracking-wider">Rejected</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold bg-brand-blue/10 text-brand-cyan border border-brand-blue/20 uppercase tracking-wider">Pending</span>;
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white font-display uppercase">Request Center</h2>
          <p className="text-xs text-brand-text-soft mt-1">Submit or review paid leaves, work-from-home periods, and half-days.</p>
        </div>

        <button
          onClick={() => setSubmitModalOpen(true)}
          className="px-5 py-2.5 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg hover:scale-[1.02] active:scale-[0.98] font-bold font-display text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-blue/20"
        >
          <Plus className="w-4 h-4" />
          New Request
        </button>
      </div>

      {/* Tabs */}
      {isReviewer && (
        <div className="border-b border-brand-border flex gap-6">
          <button
            onClick={() => setActiveTab('my-requests')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
              activeTab === 'my-requests' ? 'border-brand-cyan text-white' : 'border-transparent text-brand-text-soft hover:text-white'
            }`}
          >
            My Requests Log
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
              activeTab === 'reviews' ? 'border-brand-cyan text-white' : 'border-transparent text-brand-text-soft hover:text-white'
            }`}
          >
            Pending Reviews Panel
          </button>
        </div>
      )}

      {/* Requests Logs List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Leaves */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest font-display flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-brand-blue" />
                Leaves ({leaves.length})
              </h3>
            </div>
            
            <div className="space-y-3">
              {leaves.length === 0 ? (
                <p className="text-[11px] text-brand-text-mute italic">No leaves logs found</p>
              ) : (
                leaves.map(req => (
                  <div key={req.id} className="p-4 rounded-2xl glass-panel text-left space-y-3 relative overflow-hidden">
                    {activeTab === 'reviews' && (
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-brand-border">
                        <div className="w-6 h-6 rounded-full bg-brand-bg-soft flex items-center justify-center border border-brand-border">
                          <User className="w-3 h-3 text-brand-cyan" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white leading-none">{req.employee?.fullName}</p>
                          <p className="text-[8px] text-brand-text-mute mt-0.5">{req.employee?.employeeCode}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="px-2 py-0.5 text-[8px] font-extrabold uppercase bg-brand-blue/15 text-brand-cyan border border-brand-blue/30 rounded-full">
                          {req.type}
                        </span>
                        <p className="text-[11px] text-brand-text font-bold mt-2 font-mono">
                          {new Date(req.startDate).toLocaleDateString()} — {new Date(req.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-brand-text-soft font-semibold mt-1">Total Days: {req.days}</p>
                      </div>
                      {getStatusBadge(req.status)}
                    </div>
                    {req.reason && <p className="text-xs text-brand-text-soft italic">" {req.reason} "</p>}
                    
                    {activeTab === 'reviews' && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-brand-border">
                        <button
                          onClick={() => handleReview(req.id, 'leave', 'approved')}
                          className="flex-1 py-1 rounded-full bg-brand-green hover:bg-brand-green/80 text-[10px] font-bold text-brand-bg transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReview(req.id, 'leave', 'rejected')}
                          className="flex-1 py-1 rounded-full border border-brand-border hover:bg-brand-bg-elevated text-[10px] font-bold text-brand-text-soft transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Halfdays */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest font-display flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-brand-amber" />
                Half-days ({halfdays.length})
              </h3>
            </div>
            
            <div className="space-y-3">
              {halfdays.length === 0 ? (
                <p className="text-[11px] text-brand-text-mute italic">No half-day logs found</p>
              ) : (
                halfdays.map(req => (
                  <div key={req.id} className="p-4 rounded-2xl glass-panel text-left space-y-3 relative overflow-hidden">
                    {activeTab === 'reviews' && (
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-brand-border">
                        <div className="w-6 h-6 rounded-full bg-brand-bg-soft flex items-center justify-center border border-brand-border">
                          <User className="w-3 h-3 text-brand-cyan" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white leading-none">{req.employee?.fullName}</p>
                          <p className="text-[8px] text-brand-text-mute mt-0.5">{req.employee?.employeeCode}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[11px] text-brand-text font-bold font-mono">
                          Date: {new Date(req.date).toLocaleDateString()}
                        </p>
                      </div>
                      {getStatusBadge(req.status)}
                    </div>
                    {req.reason && <p className="text-xs text-brand-text-soft italic">" {req.reason} "</p>}
                    
                    {activeTab === 'reviews' && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-brand-border">
                        <button
                          onClick={() => handleReview(req.id, 'halfday', 'approved')}
                          className="flex-1 py-1 rounded-full bg-brand-green hover:bg-brand-green/80 text-[10px] font-bold text-brand-bg transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReview(req.id, 'halfday', 'rejected')}
                          className="flex-1 py-1 rounded-full border border-brand-border hover:bg-brand-bg-elevated text-[10px] font-bold text-brand-text-soft transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* WFH */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest font-display flex items-center gap-2">
                <FileCheck className="w-3.5 h-3.5 text-brand-cyan" />
                WFH ({wfhs.length})
              </h3>
            </div>
            
            <div className="space-y-3">
              {wfhs.length === 0 ? (
                <p className="text-[11px] text-brand-text-mute italic">No WFH logs found</p>
              ) : (
                wfhs.map(req => (
                  <div key={req.id} className="p-4 rounded-2xl glass-panel text-left space-y-3 relative overflow-hidden">
                    {activeTab === 'reviews' && (
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-brand-border">
                        <div className="w-6 h-6 rounded-full bg-brand-bg-soft flex items-center justify-center border border-brand-border">
                          <User className="w-3 h-3 text-brand-cyan" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white leading-none">{req.employee?.fullName}</p>
                          <p className="text-[8px] text-brand-text-mute mt-0.5">{req.employee?.employeeCode}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[11px] text-brand-text font-bold font-mono">
                          {new Date(req.startDate).toLocaleDateString()} — {new Date(req.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      {getStatusBadge(req.status)}
                    </div>
                    {req.reason && <p className="text-xs text-brand-text-soft italic">" {req.reason} "</p>}
                    
                    {activeTab === 'reviews' && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-brand-border">
                        <button
                          onClick={() => handleReview(req.id, 'wfh', 'approved')}
                          className="flex-1 py-1 rounded-full bg-brand-green hover:bg-brand-green/80 text-[10px] font-bold text-brand-bg transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReview(req.id, 'wfh', 'rejected')}
                          className="flex-1 py-1 rounded-full border border-brand-border hover:bg-brand-bg-elevated text-[10px] font-bold text-brand-text-soft transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Submit Request Modal ---------------- */}
      <AnimatePresence>
        {submitModalOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setSubmitModalOpen(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-brand-bg-elevated border border-brand-border rounded-2xl p-6 shadow-glow z-50"
            >
              <div className="flex items-center justify-between border-b border-brand-border pb-4 mb-6">
                <h3 className="text-sm font-extrabold text-white font-display uppercase">Submit Work Request</h3>
                <button onClick={() => setSubmitModalOpen(false)} className="p-1.5 rounded-xl border border-brand-border text-brand-text-soft hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit(handleCreateRequest)} className="space-y-4 text-left">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Request Type</label>
                  <select
                    value={submitType}
                    onChange={(e) => setSubmitType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="leave">Leave Request</option>
                    <option value="halfday">Half-day Request</option>
                    <option value="wfh">Work-from-home (WFH)</option>
                  </select>
                </div>

                {submitType === 'halfday' ? (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Target Date</label>
                    <input
                      type="date"
                      {...register('date', { required: true })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                    />
                  </div>
                ) : (
                  <>
                    {submitType === 'leave' && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Leave Category</label>
                        <select
                          {...register('type', { required: true })}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none cursor-pointer"
                        >
                          <option value="Annual">Annual Paid Leave</option>
                          <option value="Sick">Sick Paid Leave</option>
                          <option value="Unpaid">Unpaid Leave</option>
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Start Date</label>
                        <input
                          type="date"
                          {...register('startDate', { required: true })}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">End Date</label>
                        <input
                          type="date"
                          {...register('endDate', { required: true })}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Reason / Details</label>
                  <textarea
                    rows={3}
                    {...register('reason', { required: true })}
                    placeholder="Provide description..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                  />
                </div>

                <div className="mt-6 flex gap-3 justify-end border-t border-brand-border pt-4">
                  <button
                    type="button"
                    onClick={() => setSubmitModalOpen(false)}
                    className="px-5 py-2 rounded-full border border-brand-border hover:bg-brand-bg font-semibold text-xs text-brand-text-soft hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg hover:scale-[1.02] transition-colors font-bold font-display text-xs cursor-pointer shadow-md shadow-brand-blue/15"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
