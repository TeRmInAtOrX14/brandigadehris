import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Briefcase,
  Plus,
  Percent,
  X,
  Loader2,
  DollarSign,
  Trash2,
  Layers,
  Users
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [commissions, setCommissions] = useState({ projectCommissions: [], teamCommissions: [] });
  const [loading, setLoading] = useState(true);

  // Modals
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);

  // Slabs state inside the edit modal
  const [sdrSlabs, setSdrSlabs] = useState([]);
  const [teamSlabs, setTeamSlabs] = useState([]);

  const currentUser = JSON.parse(localStorage.getItem('user')) || { role: 'Employee' };
  const isAdmin = ['Admin', 'CEO', 'COO'].includes(currentUser.role);
  const { register, handleSubmit, reset } = useForm();

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await api.get('/projects');
      setProjects(res.data);
      
      const commRes = await api.get('/projects/commissions');
      setCommissions(commRes.data);
      
      if (isAdmin) {
        const empRes = await api.get('/employees');
        setEmployees(empRes.data);
      }
    } catch (e) {
      toast.error('Failed to load campaigns data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleCreateProject = async (data) => {
    try {
      await api.post('/projects', data);
      toast.success('Campaign created successfully!');
      setCreateProjectOpen(false);
      reset();
      fetchCampaigns();
    } catch (err) {
      toast.error('Failed to create campaign');
    }
  };

  const handleAssign = async (data) => {
    try {
      await api.post(`/projects/${selectedProjectId}/assign`, data);
      toast.success('Employee assigned successfully');
      setAssignOpen(false);
      reset();
      fetchCampaigns();
    } catch (err) {
      toast.error('Failed to assign employee to campaign');
    }
  };

  const openCommissionModal = (proj) => {
    setSelectedProjectId(proj.id);
    setSelectedProject(proj);
    
    // Load existing settings if they exist
    const settings = proj.settings || {};
    setSdrSlabs(settings.sdrSlabs || []);
    setTeamSlabs(settings.teamSlabs || []);
    setCommissionModalOpen(true);
  };

  const handleAddSdrSlab = () => {
    setSdrSlabs([...sdrSlabs, { min: '', max: '', rate: '' }]);
  };

  const handleRemoveSdrSlab = (idx) => {
    setSdrSlabs(sdrSlabs.filter((_, i) => i !== idx));
  };

  const handleSdrSlabChange = (idx, field, value) => {
    const updated = [...sdrSlabs];
    updated[idx][field] = value;
    setSdrSlabs(updated);
  };

  const handleAddTeamSlab = () => {
    setTeamSlabs([...teamSlabs, { minAvg: '', maxAvg: '', rate: '' }]);
  };

  const handleRemoveTeamSlab = (idx) => {
    setTeamSlabs(teamSlabs.filter((_, i) => i !== idx));
  };

  const handleTeamSlabChange = (idx, field, value) => {
    const updated = [...teamSlabs];
    updated[idx][field] = value;
    setTeamSlabs(updated);
  };

  const handleSaveSlabs = async (e) => {
    e.preventDefault();
    try {
      // Validate inputs are parsed
      const cleanSdrSlabs = sdrSlabs.map(slab => ({
        min: parseInt(slab.min) || 0,
        max: parseInt(slab.max) || 0,
        rate: parseFloat(slab.rate) || 0
      }));

      const cleanTeamSlabs = teamSlabs.map(slab => ({
        minAvg: parseFloat(slab.minAvg) || 0,
        maxAvg: parseFloat(slab.maxAvg) || 0,
        rate: parseFloat(slab.rate) || 0
      }));

      const updatedSettings = {
        ...(selectedProject.settings || {}),
        sdrSlabs: cleanSdrSlabs,
        teamSlabs: cleanTeamSlabs
      };

      await api.put(`/projects/${selectedProjectId}`, {
        name: selectedProject.name,
        description: selectedProject.description,
        status: selectedProject.status,
        settings: updatedSettings
      });

      toast.success('Commission slab structures saved!');
      setCommissionModalOpen(false);
      fetchCampaigns();
    } catch (err) {
      toast.error('Failed to update campaign slab rules');
    }
  };

  const handleUnassign = async (projectId, employeeId) => {
    if (confirm('Remove employee assignment from this campaign?')) {
      try {
        await api.delete(`/projects/${projectId}/assign/${employeeId}`);
        toast.success('Assignment removed successfully');
        fetchCampaigns();
      } catch (err) {
        toast.error('Failed to remove assignment');
      }
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white font-display uppercase">Campaigns & Commissions</h2>
          <p className="text-xs text-brand-text-soft mt-1">Manage outbound sales campaigns, SDR success payouts, and TL override rules.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreateProjectOpen(true)}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg hover:scale-[1.02] active:scale-[0.98] font-bold font-display text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-blue/20"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Campaigns Lists */}
          <div className="xl:col-span-2 space-y-6">
            {projects.map(proj => {
              const sdrSlabs = proj.settings?.sdrSlabs || [];
              const teamSlabs = proj.settings?.teamSlabs || [];

              return (
                <div key={proj.id} className="p-6 rounded-2xl glass-panel space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-extrabold text-white font-display">{proj.name}</h3>
                      <p className="text-xs text-brand-text-soft mt-1 leading-relaxed">{proj.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-extrabold border uppercase tracking-wider ${
                        proj.status === 'active'
                          ? 'bg-brand-green/10 text-brand-green border-brand-green/20'
                          : 'bg-brand-bg-elevated text-brand-text-mute border-brand-border'
                      }`}>
                        {proj.status}
                      </span>
                    </div>
                  </div>

                  {/* Slabs configurations list summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-b border-brand-border py-4 text-xs">
                    <div>
                      <h4 className="text-[10px] font-bold text-brand-text-mute uppercase tracking-widest flex items-center gap-1.5 mb-2 font-display">
                        <Layers className="w-3.5 h-3.5 text-brand-blue" />
                        SDR Showup Slabs
                      </h4>
                      {sdrSlabs.length === 0 ? (
                        <p className="text-[10px] text-brand-text-soft italic">Flat rate fallback or not configured</p>
                      ) : (
                        <div className="space-y-1">
                          {sdrSlabs.map((slab, i) => (
                            <div key={i} className="flex justify-between text-brand-text font-mono bg-brand-bg/45 px-2.5 py-1 rounded border border-brand-border">
                              <span>Showups {slab.min} - {slab.max}:</span>
                              <span className="font-extrabold text-brand-cyan">PKR {slab.rate}/ea</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-[10px] font-bold text-brand-text-mute uppercase tracking-widest flex items-center gap-1.5 mb-2 font-display">
                        <Users className="w-3.5 h-3.5 text-brand-violet" />
                        TL Team Average Slabs
                      </h4>
                      {teamSlabs.length === 0 ? (
                        <p className="text-[10px] text-brand-text-soft italic">Flat override fallback or not configured</p>
                      ) : (
                        <div className="space-y-1">
                          {teamSlabs.map((slab, i) => (
                            <div key={i} className="flex justify-between text-brand-text font-mono bg-brand-bg/45 px-2.5 py-1 rounded border border-brand-border">
                              <span>Avg Showups {slab.minAvg} - {slab.maxAvg}:</span>
                              <span className="font-extrabold text-brand-cyan">PKR {slab.rate}/ea</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Assigned Staff */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-bold text-white uppercase tracking-widest font-display">Assigned Campaign Staff</h4>
                      {isAdmin && (
                        <div className="flex gap-4">
                          <button
                            onClick={() => { setSelectedProjectId(proj.id); setAssignOpen(true); }}
                            className="text-[10px] font-bold text-brand-cyan hover:underline cursor-pointer"
                          >
                            Assign Staff
                          </button>
                          <button
                            onClick={() => openCommissionModal(proj)}
                            className="text-[10px] font-bold text-brand-cyan hover:underline cursor-pointer"
                          >
                            Set Slab Rates
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {proj.employeeProjects.length === 0 ? (
                        <p className="text-[10px] text-brand-text-mute italic">No personnel assigned to this campaign</p>
                      ) : (
                        proj.employeeProjects.map(ep => (
                          <div key={ep.employeeId} className="flex justify-between items-center p-2 rounded-xl bg-brand-bg/40 border border-brand-border">
                            <div>
                              <span className="text-xs font-bold text-white">{ep.employee.fullName}</span>
                              <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-brand-bg-elevated text-brand-text-soft border border-brand-border">
                                {ep.role}
                              </span>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => handleUnassign(proj.id, ep.employeeId)}
                                className="p-1 rounded text-brand-text-mute hover:text-brand-amber transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sidebar Commission Widget */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl glass-panel text-left space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest font-display flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-brand-cyan" />
                Team-level Commissions
              </h3>
              <p className="text-xs text-brand-text-soft leading-relaxed">
                Monthly team commissions are pool overrides shared equally or distributed per campaign target completions.
              </p>
              
              <div className="space-y-2">
                {commissions.teamCommissions.map(tc => (
                  <div key={tc.id} className="p-3.5 rounded-xl bg-brand-bg-soft border border-brand-border flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-white">{tc.team?.name}</p>
                      <p className="text-[9px] text-brand-text-mute mt-0.5 uppercase tracking-wider font-extrabold">Flat Monthly Pool</p>
                    </div>
                    <span className="text-sm font-extrabold text-brand-green font-mono">PKR {tc.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Create Project Modal ---------------- */}
      {createProjectOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreateProjectOpen(false)} />
          <div className="bg-brand-bg-elevated border border-brand-border rounded-2xl p-6 w-full max-w-md shadow-glow relative z-50 text-left">
            <div className="flex justify-between items-center border-b border-brand-border pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-white uppercase font-display">Create Campaign</h3>
              <button onClick={() => setCreateProjectOpen(false)} className="p-1 rounded text-brand-text-soft hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit(handleCreateProject)} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-text-soft mb-1.5">Campaign Name</label>
                <input type="text" {...register('name', { required: true })} placeholder="e.g. US Solar Campaign" className="w-full px-3.5 py-2.5 rounded-xl bg-brand-bg border border-brand-border text-xs text-white focus:outline-none focus:border-brand-blue" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-text-soft mb-1.5">Description</label>
                <textarea rows={3} {...register('description')} placeholder="Detail the campaign parameters..." className="w-full px-3.5 py-2.5 rounded-xl bg-brand-bg border border-brand-border text-xs text-white focus:outline-none focus:border-brand-blue" />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg font-bold font-display text-xs cursor-pointer shadow-md shadow-brand-blue/15">Save Campaign</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Assign Staff Modal ---------------- */}
      {assignOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAssignOpen(false)} />
          <div className="bg-brand-bg-elevated border border-brand-border rounded-2xl p-6 w-full max-w-md shadow-glow relative z-50 text-left">
            <div className="flex justify-between items-center border-b border-brand-border pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-white uppercase font-display">Assign Personnel</h3>
              <button onClick={() => setAssignOpen(false)} className="p-1 rounded text-brand-text-soft hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit(handleAssign)} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-text-soft mb-1.5">Select Employee</label>
                <select {...register('employeeId', { required: true })} className="w-full px-3.5 py-2.5 rounded-xl bg-brand-bg border border-brand-border text-xs text-white focus:outline-none cursor-pointer">
                  <option value="">Choose profile...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-text-soft mb-1.5">Campaign Role</label>
                <select {...register('role', { required: true })} className="w-full px-3.5 py-2.5 rounded-xl bg-brand-bg border border-brand-border text-xs text-white focus:outline-none cursor-pointer">
                  <option value="sdr">SDR (Campaigner)</option>
                  <option value="team_lead">Team Lead (Override Eligible)</option>
                </select>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg font-bold font-display text-xs cursor-pointer shadow-md shadow-brand-blue/15">Save Assignment</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Set Dynamic Slabs Commission Rates Modal ---------------- */}
      {commissionModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCommissionModalOpen(false)} />
          <div className="bg-brand-bg-elevated border border-brand-border rounded-2xl p-6 w-full max-w-2xl shadow-glow relative z-50 text-left max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-3 mb-6">
              <h3 className="text-sm font-extrabold text-white uppercase font-display">Configure Campaign Commission Slabs</h3>
              <button onClick={() => setCommissionModalOpen(false)} className="p-1 rounded text-brand-text-soft hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSaveSlabs} className="space-y-6">
              {/* SDR Commission Slabs list editor */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-brand-border pb-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-widest font-display">SDR Showup Slabs</h4>
                  <button
                    type="button"
                    onClick={handleAddSdrSlab}
                    className="text-[10px] font-bold text-brand-cyan hover:underline cursor-pointer"
                  >
                    + Add SDR Slab
                  </button>
                </div>
                
                <div className="space-y-2">
                  {sdrSlabs.length === 0 ? (
                    <p className="text-[10px] text-brand-text-soft italic">No showups slabs defined yet. Commissions will default to flat rates.</p>
                  ) : (
                    sdrSlabs.map((slab, i) => (
                      <div key={i} className="flex items-center gap-3 bg-brand-bg/40 p-3 rounded-xl border border-brand-border">
                        <div className="flex-1">
                          <label className="block text-[8px] uppercase text-brand-text-mute font-bold mb-1">Min Showups</label>
                          <input
                            type="number"
                            value={slab.min}
                            onChange={(e) => handleSdrSlabChange(i, 'min', e.target.value)}
                            placeholder="e.g. 0"
                            className="w-full px-2.5 py-1.5 rounded bg-brand-bg border border-brand-border text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[8px] uppercase text-brand-text-mute font-bold mb-1">Max Showups</label>
                          <input
                            type="number"
                            value={slab.max}
                            onChange={(e) => handleSdrSlabChange(i, 'max', e.target.value)}
                            placeholder="e.g. 5"
                            className="w-full px-2.5 py-1.5 rounded bg-brand-bg border border-brand-border text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[8px] uppercase text-brand-text-mute font-bold mb-1">Rate (PKR/showup)</label>
                          <input
                            type="number"
                            value={slab.rate}
                            onChange={(e) => handleSdrSlabChange(i, 'rate', e.target.value)}
                            placeholder="e.g. 1000"
                            className="w-full px-2.5 py-1.5 rounded bg-brand-bg border border-brand-border text-xs text-white focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSdrSlab(i)}
                          className="p-1.5 mt-4 rounded hover:bg-brand-bg-soft text-brand-text-mute hover:text-brand-amber transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Team Lead Commission Slabs list editor */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-brand-border pb-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-widest font-display">Team Lead Override Slabs (Based on Team Avg Showups)</h4>
                  <button
                    type="button"
                    onClick={handleAddTeamSlab}
                    className="text-[10px] font-bold text-brand-cyan hover:underline cursor-pointer"
                  >
                    + Add Team Slab
                  </button>
                </div>
                
                <div className="space-y-2">
                  {teamSlabs.length === 0 ? (
                    <p className="text-[10px] text-brand-text-soft italic">No team override slabs defined. Falls back to flat Team Lead override rate.</p>
                  ) : (
                    teamSlabs.map((slab, i) => (
                      <div key={i} className="flex items-center gap-3 bg-brand-bg/40 p-3 rounded-xl border border-brand-border">
                        <div className="flex-1">
                          <label className="block text-[8px] uppercase text-brand-text-mute font-bold mb-1">Min Team Avg</label>
                          <input
                            type="number"
                            step="0.1"
                            value={slab.minAvg}
                            onChange={(e) => handleTeamSlabChange(i, 'minAvg', e.target.value)}
                            placeholder="e.g. 0"
                            className="w-full px-2.5 py-1.5 rounded bg-brand-bg border border-brand-border text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[8px] uppercase text-brand-text-mute font-bold mb-1">Max Team Avg</label>
                          <input
                            type="number"
                            step="0.1"
                            value={slab.maxAvg}
                            onChange={(e) => handleTeamSlabChange(i, 'maxAvg', e.target.value)}
                            placeholder="e.g. 5.9"
                            className="w-full px-2.5 py-1.5 rounded bg-brand-bg border border-brand-border text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[8px] uppercase text-brand-text-mute font-bold mb-1">Override Rate (PKR/showup)</label>
                          <input
                            type="number"
                            value={slab.rate}
                            onChange={(e) => handleTeamSlabChange(i, 'rate', e.target.value)}
                            placeholder="e.g. 200"
                            className="w-full px-2.5 py-1.5 rounded bg-brand-bg border border-brand-border text-xs text-white focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveTeamSlab(i)}
                          className="p-1.5 mt-4 rounded hover:bg-brand-bg-soft text-brand-text-mute hover:text-brand-amber transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button type="submit" className="w-full py-3 rounded-full bg-gradient-to-r from-brand-blue via-brand-violet to-brand-cyan text-brand-bg font-bold font-display text-xs cursor-pointer shadow-md shadow-brand-blue/15">Save Slab Settings</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
