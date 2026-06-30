import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  // Selected employee type (Admin, Team Lead, SDR)
  const [selectedRole, setSelectedRole] = useState('Admin');
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      email: '',
      password: ''
    }
  });

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (localStorage.getItem('accessToken')) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // Update form fields when role changes
  useEffect(() => {
    const credentials = {
      Admin: { email: 'admin@brandigade.com', password: 'admin123' },
      Lead: { email: 'lead@brandigade.com', password: 'test123' },
      SDR: { email: 'test@brandigade.com', password: 'test123' }
    };
    const { email, password } = credentials[selectedRole] || credentials['Admin'];
    setValue('email', email);
    setValue('password', password);
  }, [selectedRole, setValue]);

  const onSubmit = async (data) => {
    // Ensure any stale credentials are cleared before attempting login
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    try {
      setLoading(true);
      const res = await api.post('/auth/login', {
        email: data.email,
        password: data.password
      });

      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.data.user));

      toast.success('Welcome to Brandigade HRIS!');
      navigate('/dashboard');
    } catch (err) {
      // On failure, clear any potentially saved tokens to avoid stale state
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      toast.error(err.response?.data?.error || 'Invalid credentials or inactive account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg px-4 relative overflow-hidden">
      {/* Background atmosphere glows matching brandigade.com */}
      <div className="glow-field">
        <span className="g1" />
        <span className="g2" />
        <span className="g3" />
      </div>
      
      {/* Noise Grid overlay */}
      <div className="noise-grid absolute inset-0 z-0 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md p-8 rounded-2xl glass-panel shadow-glow relative z-10"
      >
        {/* Logo Container */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <img src="/logo.png" alt="Brandigade logo" className="h-24 w-auto object-contain" />
            <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest bg-brand-blue text-white rounded">
              HRIS
            </span>
          </div>
          <p className="text-xs text-brand-text-soft font-display uppercase tracking-wider font-bold">
            Enterprise Intelligence Portal
          </p>
        </div>

        {/* Role Selector for Testing */}
        <div className="flex items-center space-x-4 mb-4">
          <label className="text-sm font-medium text-brand-text-soft" htmlFor="role-select">User Type:</label>
          <select
            id="role-select"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="rounded-md border border-brand-border bg-brand-bg-soft p-2 text-sm text-brand-text"
          >
            <option value="Admin">Admin</option>
            <option value="Lead">Team Lead</option>
            <option value="SDR">SDR / Employee</option>
          </select>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-mute" />
              <input
                type="email"
                placeholder="name@brandigade.com"
                {...register('email', { required: 'Email is required' })}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-border bg-brand-bg-soft text-sm text-brand-text placeholder-brand-text-mute focus:outline-none focus:border-brand-blue transition-colors"
              />
            </div>
            {errors.email && (
              <span className="text-xs text-brand-amber mt-1 block">{errors.email.message}</span>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft">
                Password
              </label>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-mute" />
              <input
                type="password"
                placeholder="••••••••"
                {...register('password', { required: 'Password is required' })}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-border bg-brand-bg-soft text-sm text-brand-text placeholder-brand-text-mute focus:outline-none focus:border-brand-blue transition-colors"
              />
            </div>
            {errors.password && (
              <span className="text-xs text-brand-amber mt-1 block">{errors.password.message}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-full font-bold font-display text-sm bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group shadow-lg shadow-brand-blue/30"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Sign In to Workspace
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
