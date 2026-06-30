import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Briefcase, Calendar, Plus, Edit, Trash2, Gift } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

// Placeholder Admin Dashboard – you can flesh out the actual data fetching & API calls later.
export default function AdminDashboard({ stats }) {
  const [loading, setLoading] = useState(false);

  const handleMakeLead = async (employeeId, teamId) => {
    try {
      setLoading(true);
      await api.patch(`/employees/${employeeId}`, { role: 'Team Lead', teamId });
      toast.success('Employee promoted to Team Lead');
    } catch (err) {
      toast.error('Failed to assign Team Lead');
    } finally {
      setLoading(false);
    }
  };
  return (
    <motion.div className="space-y-6" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } }}} initial="hidden" animate="show">
      {/* --- Stats Grid (same as before) --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Headcount */}
        <div className="p-6 rounded-2xl glass-panel card-hover text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Total Headcount</span>
            <Users className="w-5 h-5 text-brand-blue" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.totalEmployees}</p>
        </div>
        {/* ... other stats omitted for brevity ... */}
      </div>

      {/* --- Team Management Section --- */}
      <section className="p-6 rounded-2xl glass-panel">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center">
          <Briefcase className="w-5 h-5 mr-2" />Team Management
        </h2>
        <div className="flex space-x-4 mb-4">
          <button className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded hover:bg-brand-blue/80">
            <Plus className="w-4 h-4" />Add Team
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded hover:bg-brand-green/80">
            <Gift className="w-4 h-4" />Give Spiff
          </button>
        </div>
        {/* Placeholder table of teams */}
        <table className="w-full text-sm text-left text-brand-text-soft">
          <thead className="bg-brand-bg-soft">
            <tr>
              <th className="px-4 py-2">Team Name</th>
              <th className="px-4 py-2">Lead</th>
              <th className="px-4 py-2">Members</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-brand-border">
              <td className="px-4 py-2">Sales Alpha</td>
              <td className="px-4 py-2">John Doe</td>
              <td className="px-4 py-2">12</td>
              <td className="px-4 py-2 flex space-x-2">
                <button className="p-1 rounded hover:bg-brand-bg-soft">
                  <Edit className="w-4 h-4 text-brand-blue" />
                </button>
                <button className="p-1 rounded hover:bg-brand-bg-soft" disabled={loading} onClick={() => handleMakeLead(emp.id, emp.teamId)}>
                  <Gift className="w-4 h-4 text-brand-green" />
                </button>
                <button className="p-1 rounded hover:bg-brand-bg-soft"><Trash2 className="w-4 h-4 text-brand-red" /></button>
              </td>
            </tr>
            {/* More rows would be generated dynamically */}
          </tbody>
        </table>
      </section>
    </motion.div>
  );
}
