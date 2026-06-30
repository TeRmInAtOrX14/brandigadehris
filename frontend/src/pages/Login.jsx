import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGoogleLogin } from '@react-oauth/google';
import api from '../utils/api';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: { email: '', password: '' }
  });

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (localStorage.getItem('accessToken')) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const saveSession = (data) => {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    toast.success('Welcome to Brandigade HRIS!');
    navigate('/dashboard');
  };

  // Traditional email + password login
  const onSubmit = async (data) => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    try {
      setLoading(true);
      const res = await api.post('/auth/login', {
        email: data.email,
        password: data.password
      });
      saveSession(res.data);
    } catch (err) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      toast.error(err.response?.data?.error || 'Invalid credentials or inactive account.');
    } finally {
      setLoading(false);
    }
  };

  // Google SSO login
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setGoogleLoading(true);
        // Exchange the access token for user info, then send to backend
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        const userInfo = await userInfoRes.json();

        // Send to our backend's google-login endpoint
        const res = await api.post('/auth/google-login', {
          idToken: tokenResponse.access_token,
          email: userInfo.email,
          googleId: userInfo.sub,
          name: userInfo.name,
          picture: userInfo.picture
        });
        saveSession(res.data);
      } catch (err) {
        toast.error(err.response?.data?.error || 'Google sign-in failed. Make sure your account has access.');
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: () => {
      toast.error('Google sign-in was cancelled or failed.');
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg px-4 relative overflow-hidden">
      {/* Background atmosphere glows */}
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
        {/* Logo */}
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

        {/* Google SSO Button */}
        <button
          type="button"
          onClick={() => googleLogin()}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-brand-border bg-brand-bg-soft hover:bg-white/10 transition-all text-sm font-semibold text-brand-text mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {googleLoading ? 'Signing in...' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-brand-border" />
          <span className="text-xs text-brand-text-mute uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-brand-border" />
        </div>

        {/* Email + Password Form */}
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
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-soft mb-2">
              Password
            </label>
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
            disabled={loading || googleLoading}
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
