import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import {
  Calendar,
  CheckCircle,
  AlertCircle,
  Clock,
  RotateCw,
  Plus,
  X,
  User,
  Loader2
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // Modals
  const [manualModalOpen, setManualModalOpen] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user')) || { role: 'Employee' };
  const isAdmin = ['Admin', 'CEO', 'COO'].includes(currentUser.role);
  const { register, handleSubmit, reset } = useForm();

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/attendance?startDate=${startDate}&endDate=${endDate}&employeeId=${selectedEmployee}`);
      setRecords(res.data);
    } catch (e) {
      toast.error('Failed to load attendance logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (isAdmin) {
      try {
        const res = await api.get('/employees');
        setEmployees(res.data);
      } catch (e) {
        console.error('Failed to load employees for filter');
      }
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [startDate, endDate, selectedEmployee]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleSync = async () => {
    try {
      setSyncing(true);
      toast.loading('Connecting to ZKTeco machine...', { id: 'zk-sync' });
      const res = await api.post('/attendance/sync');
      toast.success(`Synced successfully! New punches: ${res.data.synced}, Skipped: ${res.data.skipped}`, { id: 'zk-sync' });
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Biometric sync timed out. Make sure the machine is online.', { id: 'zk-sync' });
    } finally {
      setSyncing(false);
    }
  };

  const handleManualPunch = async (data) => {
    try {
      await api.post('/attendance/manual', data);
      toast.success('Attendance punch logged successfully');
      setManualModalOpen(false);
      reset();
      fetchAttendance();
    } catch (e) {
      toast.error('Failed to log manual punch');
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white font-display uppercase">Attendance Registry</h2>
          <p className="text-xs text-brand-text-soft mt-1">Review biometric check-in details, grace periods, and late penalties.</p>
        </div>
        
        <div className="flex gap-3">
          {isAdmin && (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-5 py-2.5 rounded-full border border-brand-border hover:border-brand-border-strong bg-brand-bg-soft/40 text-xs font-bold uppercase tracking-wider font-display text-brand-text-soft hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                Sync Biometric
              </button>

              <button
                onClick={() => setManualModalOpen(true)}
                className="px-5 py-2.5 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg hover:scale-[1.02] transition-all font-bold font-display text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-blue/20"
              >
                <Plus className="w-4 h-4" />
                Manual Punch
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters Box */}
      <div className="p-4 rounded-2xl border border-brand-border bg-brand-bg-soft/40 flex flex-col md:flex-row gap-4 items-center">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Calendar className="w-4 h-4 text-brand-text-mute" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onClick={(e) => e.target.showPicker && e.target.showPicker()}
            className="px-3.5 py-2 rounded-xl border border-brand-border bg-brand-bg/40 text-xs text-white focus:outline-none cursor-pointer"
          />
          <span className="text-brand-text-mute text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            onClick={(e) => e.target.showPicker && e.target.showPicker()}
            className="px-3.5 py-2 rounded-xl border border-brand-border bg-brand-bg/40 text-xs text-white focus:outline-none cursor-pointer"
          />
        </div>

        {isAdmin && (
          <div className="relative w-full md:w-56">
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-brand-border bg-brand-bg/40 text-xs text-white appearance-none cursor-pointer focus:outline-none focus:border-brand-blue"
            >
              <option value="">All Employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Grid of logs */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
        </div>
      ) : records.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-brand-border rounded-2xl">
          <p className="text-xs text-brand-text-soft">No attendance punch logs found within date range</p>
        </div>
      ) : (
        <div className="border border-brand-border rounded-2xl bg-brand-bg-soft/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg-elevated/40 text-[9px] uppercase font-extrabold tracking-widest text-brand-text-soft">
                  <th className="p-4">Date</th>
                  <th className="p-4">Staff Member</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Check-In</th>
                  <th className="p-4">Late Mins</th>
                  <th className="p-4">Note / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border text-xs text-brand-text-soft">
                {records.map(rec => (
                  <tr key={rec.id} className="hover:bg-brand-bg-elevated/20 transition-colors">
                    <td className="p-4 font-bold text-white font-mono">{formatDate(rec.date)}</td>
                    <td className="p-4">
                      <div className="font-bold text-white">{rec.employee?.fullName}</div>
                      <div className="text-[10px] text-brand-text-mute mt-0.5">{rec.employee?.employeeCode}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${
                        rec.status === 'present'
                          ? 'bg-brand-green/10 text-brand-green border-brand-green/20'
                          : rec.status === 'half_day'
                          ? 'bg-brand-amber/10 text-brand-amber border-brand-amber/20'
                          : rec.status === 'leave'
                          ? 'bg-brand-violet/10 text-brand-violet border-brand-violet/20'
                          : 'bg-brand-bg-elevated text-brand-text-mute border-brand-border'
                      }`}>
                        {rec.status === 'half_day' ? 'Half Day' : rec.status}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-brand-text">{formatTime(rec.checkIn)}</td>
                    <td className="p-4 font-mono text-center">
                      {rec.late > 0 ? (
                        <span className="text-brand-amber font-bold">{rec.late} mins</span>
                      ) : (
                        <span className="text-brand-text-mute">-</span>
                      )}
                    </td>
                    <td className="p-4 text-brand-text-soft italic">"{rec.note || '-'}"</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Manual Punch Modal ---------------- */}
      <AnimatePresence>
        {manualModalOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setManualModalOpen(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-brand-bg-elevated border border-brand-border rounded-2xl p-6 shadow-glow z-50"
            >
              <div className="flex items-center justify-between border-b border-brand-border pb-4 mb-6">
                <h3 className="text-sm font-extrabold text-white font-display uppercase">Log Manual Punch</h3>
                <button onClick={() => setManualModalOpen(false)} className="p-1.5 rounded-xl border border-brand-border text-brand-text-soft hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit(handleManualPunch)} className="space-y-4 text-left">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Select Employee</label>
                  <select
                    {...register('employeeId', { required: true })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="">Choose profile...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Punch Date</label>
                  <input
                    type="date"
                    {...register('date', { required: true })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Attendance Status</label>
                  <select
                    {...register('status', { required: true })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="present">Present</option>
                    <option value="half_day">Half Day</option>
                    <option value="leave">Leave (Paid)</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Check-In Time</label>
                  <input
                    type="datetime-local"
                    {...register('checkIn')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Note / Reason</label>
                  <textarea
                    rows={2}
                    {...register('note')}
                    placeholder="e.g. Forgot to scan biometric punch..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                  />
                </div>

                <div className="mt-6 flex gap-3 justify-end border-t border-brand-border pt-4">
                  <button
                    type="button"
                    onClick={() => setManualModalOpen(false)}
                    className="px-5 py-2 rounded-full border border-brand-border hover:bg-brand-bg font-semibold text-xs text-brand-text-soft hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg hover:scale-[1.02] transition-colors font-bold font-display text-xs cursor-pointer shadow-md shadow-brand-blue/15"
                  >
                    Punch Record
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
