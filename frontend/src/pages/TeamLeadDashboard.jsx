import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Edit, Trash2, Plus, Gift } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

// Team Lead Dashboard – shows data only for the lead's assigned team
export default function TeamLeadDashboard() {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Current user info (role already guaranteed to be Team Lead by parent)
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};
  const teamId = currentUser.employee?.teamId;

  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        setLoading(true);
        // Backend endpoint respects Team Lead RBAC and will only return employees of this lead's team
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
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-brand-text-soft">Loading team data...</p>
      </div>
    );
  }

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80 } } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.h2 variants={item} className="text-2xl font-bold text-white">
        Team Lead Dashboard {teamId ? `- Team ${teamId}` : ''}
      </motion.h2>

      {/* Team actions */}
      <motion.div variants={item} className="flex space-x-4">
        <button className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded hover:bg-brand-blue/80">
          <Plus className="w-4 h-4" /> Add Member
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded hover:bg-brand-green/80">
          <Gift className="w-4 h-4" /> Give Spiff
        </button>
      </motion.div>

      {/* Team members table */}
      <motion.table variants={item} className="w-full text-sm text-left text-brand-text-soft">
        <thead className="bg-brand-bg-soft">
          <tr>
            <th className="px-4 py-2">Employee</th>
            <th className="px-4 py-2">Designation</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {teamMembers.map((emp) => (
            <tr key={emp.id} className="border-b border-brand-border hover:bg-brand-bg-soft/50">
              <td className="px-4 py-2">{emp.fullName}</td>
              <td className="px-4 py-2">{emp.designation}</td>
              <td className="px-4 py-2 flex space-x-2">
                <button className="p-1 rounded hover:bg-brand-bg-soft">
                  <Edit className="w-4 h-4 text-brand-blue" />
                </button>
                <button className="p-1 rounded hover:bg-brand-bg-soft">
                  <Trash2 className="w-4 h-4 text-brand-red" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </motion.table>
    </motion.div>
  );
}
