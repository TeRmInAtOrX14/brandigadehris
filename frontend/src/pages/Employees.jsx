import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import {
  Search,
  Plus,
  Mail,
  User,
  Shield,
  Briefcase,
  Calendar,
  X,
  CreditCard,
  Phone,
  Eye,
  Trash2,
  Loader2,
  Clock
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering states
  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  
  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState(null);

  const currentUser = JSON.parse(localStorage.getItem('user')) || { role: 'Employee' };
  const isAdmin = ['Admin', 'CEO', 'COO'].includes(currentUser.role);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/employees?teamId=${selectedTeam}&search=${search}`);
      setEmployees(res.data);
    } catch (e) {
      toast.error('Failed to load employee directory');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilters = async () => {
    try {
      const tms = await api.get('/employees/teams');
      setTeams(tms.data);
    } catch (e) {
      console.error('Failed to load filter metadata');
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [selectedTeam, search]);

  useEffect(() => {
    fetchFilters();
  }, []);

  const handleAddEmployee = async (data) => {
    try {
      await api.post('/employees', data);
      toast.success('Employee created successfully!');
      setAddModalOpen(false);
      reset();
      fetchEmployees();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create employee');
    }
  };

  const handleTerminate = async (id) => {
    if (confirm('Are you sure you want to terminate this employee? This will deactivate their user login and send them a termination email.')) {
      try {
        await api.post(`/employees/${id}/terminate`);
        toast.success('Employee terminated successfully. Email sent.');
        setDetailEmployee(null);
        fetchEmployees();
      } catch (e) {
        toast.error('Termination action failed');
      }
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (confirm('WARNING: Are you absolutely sure you want to delete this employee? This will permanently delete their profile, user credentials, attendance history, payslips, leaves, loans, and EVERYTHING else. This action CANNOT be undone.')) {
      try {
        await api.delete(`/employees/${id}`);
        toast.success('Employee and all records deleted permanently');
        setDetailEmployee(null);
        fetchEmployees();
      } catch (e) {
        toast.error('Failed to delete employee record');
      }
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white font-display uppercase">Employee Directory</h2>
          <p className="text-xs text-brand-text-soft mt-1">Manage personnel registry, team mapping, and shift timing properties.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAddModalOpen(true)}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg hover:scale-[1.02] active:scale-[0.98] font-bold font-display text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-blue/20"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        )}
      </div>

      {/* Filter Widgets */}
      <div className="p-4 rounded-2xl border border-brand-border bg-brand-bg-soft/40 flex flex-col md:flex-row gap-4 items-center">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-mute" />
          <input
            type="text"
            placeholder="Search by name, code or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-border bg-brand-bg/40 text-xs text-white focus:outline-none focus:border-brand-blue transition-colors"
          />
        </div>

        {/* Team Filter */}
        <div className="relative w-full md:w-48">
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-brand-border bg-brand-bg/40 text-xs text-white focus:outline-none focus:border-brand-blue appearance-none cursor-pointer"
          >
            <option value="">All Teams</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Directory Table */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
        </div>
      ) : employees.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-brand-border rounded-2xl">
          <p className="text-xs text-brand-text-soft">No employee records found matching criteria</p>
        </div>
      ) : (
        <div className="border border-brand-border rounded-2xl bg-brand-bg-soft/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg-elevated/40 text-[9px] uppercase font-extrabold tracking-widest text-brand-text-soft">
                  <th className="p-4">Employee Code</th>
                  <th className="p-4">Full Name</th>
                  <th className="p-4">Designation</th>
                  <th className="p-4">Team</th>
                  <th className="p-4">Shift Timings</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border text-xs text-brand-text-soft">
                {employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-brand-bg-elevated/20 transition-colors">
                    <td className="p-4 font-mono text-brand-blue font-bold">{emp.employeeCode}</td>
                    <td className="p-4 font-bold text-white">{emp.fullName}</td>
                    <td className="p-4 text-brand-text-soft">{emp.designation}</td>
                    <td className="p-4">
                      <div className="font-semibold text-white">{emp.team?.name || 'No Team'}</div>
                    </td>
                    <td className="p-4 font-medium text-brand-text-soft font-mono">{emp.shiftStart} - {emp.shiftEnd}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${
                        emp.status === 'active'
                          ? 'bg-brand-green/10 text-brand-green border-brand-green/20'
                          : 'bg-brand-bg-elevated text-brand-text-mute border-brand-border'
                      }`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setDetailEmployee(emp)}
                        className="p-1.5 rounded-xl border border-brand-border text-brand-text-soft hover:text-white hover:border-brand-blue-soft transition-colors cursor-pointer"
                        title="View Profile"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Slide-Over Details Drawer ---------------- */}
      <AnimatePresence>
        {detailEmployee && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setDetailEmployee(null)} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-brand-bg-soft border-l border-brand-border z-50 p-6 overflow-y-auto flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between border-b border-brand-border pb-4 mb-6">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-brand-blue">{detailEmployee.employeeCode}</span>
                    <h3 className="text-lg font-extrabold text-white font-display mt-0.5">{detailEmployee.fullName}</h3>
                  </div>
                  <button onClick={() => setDetailEmployee(null)} className="p-1.5 rounded-xl border border-brand-border text-brand-text-soft hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Profile Grid */}
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-brand-bg border border-brand-border grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Email Address</p>
                      <p className="text-xs text-white font-semibold mt-1 truncate">{detailEmployee.user?.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">User Role</p>
                      <p className="text-xs text-white font-semibold mt-1">{detailEmployee.user?.role || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Designation</p>
                      <p className="text-xs text-white font-semibold mt-1">{detailEmployee.designation}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Team Assigned</p>
                      <p className="text-xs text-white font-semibold mt-1">{detailEmployee.team?.name || 'No Team'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Date of Joining</p>
                      <p className="text-xs text-white font-semibold mt-1 font-mono">
                        {detailEmployee.dateOfJoining ? new Date(detailEmployee.dateOfJoining).toLocaleDateString() : '-'}
                      </p>
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-white uppercase tracking-widest font-display">Salary & Shift Details</h4>
                  <div className="p-4 rounded-2xl bg-brand-bg border border-brand-border grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Base Salary</p>
                      <p className="text-xs text-brand-cyan font-bold mt-1 font-mono">
                        {detailEmployee.currency} {detailEmployee.baseSalary?.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Shift Timings</p>
                      <p className="text-xs text-white font-mono mt-1 font-bold">{detailEmployee.shiftStart} - {detailEmployee.shiftEnd}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Biometric Device ID</p>
                      <p className="text-xs text-white font-mono mt-1 font-bold">{detailEmployee.zkUserId || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Mobile Phone</p>
                      <p className="text-xs text-white font-semibold mt-1 font-mono">{detailEmployee.phone || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">CNIC Number</p>
                      <p className="text-xs text-white font-semibold mt-1 font-mono">{detailEmployee.cnic || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[9px] text-brand-text-mute uppercase font-bold tracking-wider">Home Address</p>
                      <p className="text-xs text-white font-semibold mt-1 leading-relaxed">{detailEmployee.address || '-'}</p>
                    </div>
                  </div>

                  {/* Salary History */}
                  {detailEmployee.salaryHistory?.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-white uppercase tracking-widest font-display">Salary History Log</h4>
                      <div className="space-y-2">
                        {detailEmployee.salaryHistory.map((sh, idx) => (
                          <div key={idx} className="p-3.5 rounded-xl border border-brand-border bg-brand-bg flex justify-between items-center">
                            <div>
                              <p className="text-xs font-bold text-brand-cyan font-mono">PKR {sh.newSalary.toLocaleString()}</p>
                              <p className="text-[10px] text-brand-text-soft mt-0.5">{sh.reason}</p>
                            </div>
                            <span className="text-[9px] text-brand-text-mute font-mono">
                              {new Date(sh.effectiveDate).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

               {/* Action Buttons */}
              {isAdmin && (
                <div className="mt-8 border-t border-brand-border pt-4 space-y-3">
                  {detailEmployee.status === 'active' && (
                    <button
                      onClick={() => handleTerminate(detailEmployee.id)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-brand-amber/10 hover:bg-brand-amber hover:text-brand-bg border border-brand-amber/30 text-xs font-bold uppercase tracking-wider font-display transition-all duration-300 cursor-pointer"
                    >
                      <Clock className="w-4 h-4" />
                      Terminate Employment & Disable Login
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteEmployee(detailEmployee.id)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-brand-red/10 hover:bg-brand-red hover:text-brand-bg border border-brand-red/30 text-xs font-bold uppercase tracking-wider font-display transition-all duration-300 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Record Permanently (Hard Delete)
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---------------- Add Employee Modal ---------------- */}
      <AnimatePresence>
        {addModalOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-brand-bg-elevated border border-brand-border rounded-2xl p-6 shadow-glow z-50 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-brand-border pb-4 mb-6">
                <h3 className="text-sm font-extrabold text-white font-display uppercase">Add New Employee Profile</h3>
                <button onClick={() => setAddModalOpen(false)} className="p-1.5 rounded-xl border border-brand-border text-brand-text-soft hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit(handleAddEmployee)} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Credentials */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Email Address *</label>
                    <input
                      type="email"
                      {...register('email', { required: true })}
                      placeholder="e.g. employee@brandigade.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Login Password *</label>
                    <input
                      type="password"
                      {...register('password', { required: true })}
                      placeholder="e.g. Password123!"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Role *</label>
                    <select
                      {...register('role', { required: true })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="Employee">Employee</option>
                      <option value="Team Lead">Team Lead</option>
                      <option value="Admin">Admin</option>
                      <option value="CEO">CEO</option>
                      <option value="COO">COO</option>
                    </select>
                  </div>

                  {/* Profile Details */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Employee Code *</label>
                    <input
                      type="text"
                      {...register('employeeCode', { required: true })}
                      placeholder="e.g. EMP-004"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Full Name *</label>
                    <input
                      type="text"
                      {...register('fullName', { required: true })}
                      placeholder="e.g. Raameen Ali"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Designation *</label>
                    <input
                      type="text"
                      {...register('designation', { required: true })}
                      placeholder="e.g. SDR Outbound Campaigner"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Team</label>
                    <select
                      {...register('teamId')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="">None</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Base Monthly Salary (PKR) *</label>
                    <input
                      type="number"
                      {...register('baseSalary', { required: true })}
                      placeholder="e.g. 55000"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Date of Joining *</label>
                    <input
                      type="date"
                      {...register('dateOfJoining', { required: true })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Biometric ZK Device User ID</label>
                    <input
                      type="text"
                      {...register('zkUserId')}
                      placeholder="e.g. 4"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                    />
                  </div>

                  {/* Shift timings inputs (check in / check out) */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Shift Start Time *</label>
                    <input
                      type="text"
                      defaultValue="09:30"
                      {...register('shiftStart', { required: true })}
                      placeholder="e.g. 09:30"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">Shift End Time *</label>
                    <input
                      type="text"
                      defaultValue="18:30"
                      {...register('shiftEnd', { required: true })}
                      placeholder="e.g. 18:30"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none focus:border-brand-blue"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">CNIC Number</label>
                    <input
                      type="text"
                      {...register('cnic')}
                      placeholder="e.g. 42101-1234567-1"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-6 flex gap-3 justify-end border-t border-brand-border pt-4">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="px-5 py-2 rounded-full border border-brand-border hover:bg-brand-bg font-semibold text-xs text-brand-text-soft hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg hover:scale-[1.02] transition-colors font-bold font-display text-xs cursor-pointer shadow-md shadow-brand-blue/15"
                  >
                    Save Profile
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
