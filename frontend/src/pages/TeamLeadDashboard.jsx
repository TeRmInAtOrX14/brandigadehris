import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Briefcase, CalendarCheck, AlertCircle, Clock } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function TeamLeadDashboard({ stats }) {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentUser = JSON.parse(localStorage.getItem('user')) || {};

  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        setLoading(true);
        const res = await api.get('/employees');
        setTeamMembers(res.data);
      } catch (err) {
        toast.error('Failed to load team members');
      } finally {
        setLoading(false);
      }
    };
    fetchTeamMembers();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <Clock className="w-6 h-6 animate-spin text-brand-cyan" />
          <p className="text-brand-text-soft text-xs">Loading team metrics...</p>
        </div>
      </div>
    );
  }

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80 } } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white font-display">Team Lead Dashboard</h2>
          <p className="text-xs text-brand-text-soft mt-1">Real-time indicators for your campaign members.</p>
        </div>
      </motion.div>

      {/* Team Metrics Cards */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Team Size */}
        <div className="p-6 rounded-2xl glass-panel hover-glow-blue text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Team Size</span>
            <Users className="w-5 h-5 text-brand-blue" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.totalEmployees || 0}</p>
        </div>

        {/* Present Today */}
        <div className="p-6 rounded-2xl glass-panel hover-glow-green text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Present Today</span>
            <CalendarCheck className="w-5 h-5 text-brand-green" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.presentToday || 0}</p>
        </div>

        {/* Late Today */}
        <div className="p-6 rounded-2xl glass-panel hover-glow-red text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Late Today</span>
            <AlertCircle className="w-5 h-5 text-brand-red" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.lateToday || 0}</p>
        </div>

        {/* Active Campaigns */}
        <div className="p-6 rounded-2xl glass-panel hover-glow-cyan text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Led Campaigns</span>
            <Briefcase className="w-5 h-5 text-brand-cyan" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.activeProjects || 0}</p>
        </div>
      </motion.div>

      {/* Team Roster Table */}
      <motion.div variants={item} className="border border-brand-border rounded-2xl bg-brand-bg-soft/40 overflow-hidden">
        <div className="p-4 border-b border-brand-border bg-brand-bg-elevated/20">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider font-display">My Team Roster</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg-elevated/40 text-[9px] uppercase font-extrabold tracking-widest text-brand-text-soft">
                <th className="p-4">Employee Code</th>
                <th className="p-4">Name</th>
                <th className="p-4">Designation</th>
                <th className="p-4">Birthday</th>
                <th className="p-4">Bank Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border text-xs text-brand-text-soft">
              {teamMembers.map((emp) => (
                <tr key={emp.id} className="hover:bg-brand-bg-elevated/20 transition-colors">
                  <td className="p-4 font-mono text-brand-blue font-bold">{emp.employeeCode}</td>
                  <td className="p-4 font-bold text-white">{emp.fullName}</td>
                  <td className="p-4">{emp.designation}</td>
                  <td className="p-4 font-mono">{emp.birthday || '-'}</td>
                  <td className="p-4 font-mono">{emp.bankAccount || '-'}</td>
                </tr>
              ))}
              {teamMembers.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-brand-text-mute text-xs">
                    No team members assigned under your led campaigns.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
