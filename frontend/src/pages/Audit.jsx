import React, { useEffect, useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const res = await api.get('/system/audit-logs');
        setLogs(res.data);
      } catch (e) {
        toast.error('Failed to load system audit trails');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-white font-display uppercase flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-cyan" />
          System Audit Trail
        </h2>
        <p className="text-xs text-brand-text-soft mt-1">Review historical admin actions, profile changes, and campaign assignments.</p>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
        </div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-brand-border rounded-2xl">
          <p className="text-xs text-brand-text-soft">No system events logged in this project yet</p>
        </div>
      ) : (
        <div className="border border-brand-border rounded-2xl bg-brand-bg-soft/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg-elevated/40 text-[9px] uppercase font-extrabold tracking-widest text-brand-text-soft">
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">User</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Affected Resource</th>
                  <th className="p-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border text-xs text-brand-text-soft">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-brand-bg-elevated/20 transition-colors">
                    <td className="p-4 font-mono text-brand-text-mute">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-white">{log.user?.email || 'System'}</div>
                      <div className="text-[10px] text-brand-text-mute mt-0.5">{log.user?.role || '-'}</div>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[8px] font-extrabold bg-brand-blue/15 text-brand-cyan border border-brand-blue/30 uppercase tracking-wider font-display">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-brand-text-soft">{log.entityType}</div>
                      <div className="text-[10px] text-brand-text-mute font-mono mt-0.5">{log.entityId || '-'}</div>
                    </td>
                    <td className="p-4 max-w-xs">
                      {log.details ? (
                        <div className="p-2 rounded-xl bg-brand-bg border border-brand-border font-mono text-[9px] text-brand-text-soft overflow-x-auto whitespace-pre">
                          {JSON.stringify(JSON.parse(log.details), null, 2)}
                        </div>
                      ) : (
                        <span className="text-brand-text-mute">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
