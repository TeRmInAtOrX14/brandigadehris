import React from 'react';
import { motion } from 'framer-motion';
import { Users, Briefcase, Calendar, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

// Simple SDR Dashboard – shows personal stats passed from parent
export default function SDRDashboard({ stats }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} initial="hidden" animate="show" className="space-y-6">
      <motion.h2 className="text-2xl font-bold text-white" variants={{ hidden: { opacity: 0 }, show: { opacity: 1 }}}>
        SDR Dashboard
      </motion.h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Headcount */}
        <div className="p-6 rounded-2xl glass-panel card-hover text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Total Headcount</span>
            <Users className="w-5 h-5 text-brand-blue" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.totalEmployees}</p>
        </div>
        {/* Present Today */}
        <div className="p-6 rounded-2xl glass-panel card-hover text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Present Today</span>
            <Briefcase className="w-5 h-5 text-brand-green" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.presentToday}</p>
        </div>
        {/* Late Today */}
        <div className="p-6 rounded-2xl glass-panel card-hover text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Late Today</span>
            <AlertCircle className="w-5 h-5 text-brand-red" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.lateToday}</p>
        </div>
        {/* Active Campaigns */}
        <div className="p-6 rounded-2xl glass-panel card-hover text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-brand-text-soft uppercase tracking-widest">Active Campaigns</span>
            <Calendar className="w-5 h-5 text-brand-cyan" />
          </div>
          <p className="text-3xl font-extrabold text-white font-display">{stats?.activeProjects}</p>
        </div>
      </div>
    </motion.div>
  );
}
