import React, { useState, useEffect } from 'react';
import { X, Play, Square, Timer } from 'lucide-react';
import { getCategoryColor } from '../../utils/helpers';

const api = window.electron || {};
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

export default function QuickStartModal({ user, categories, activeSession, onStart, onStop, onClose }) {
  const [selCat,  setSelCat]  = useState(categories[0]?.name || '');
  const [title,   setTitle]   = useState('');
  const [type,    setType]    = useState('focus');
  const [projects,setProjects]= useState([]);
  const [projId,  setProjId]  = useState('');

  useEffect(() => {
    callApi('listProjects', [], { userId: user.id }).then(p => setProjects(p || []));
  }, [user.id]);

  // Sync type with category
  useEffect(() => {
    const cat = categories.find(c => c.name === selCat);
    if (cat?.session_type) setType(cat.session_type);
  }, [selCat, categories]);

  const handleStart = () => {
    onStart({ userId: user.id, category: selCat, title: title.trim() || null, projectId: projId || null, sessionType: type });
  };

  const TYPE_OPTS = [
    { value: 'focus',   label: '🎯 Focus',   color: '#10b981' },
    { value: 'meeting', label: '👥 Meeting',  color: '#8b5cf6' },
    { value: 'break',   label: '☕ Break',    color: '#f59e0b' },
    { value: 'other',   label: '📁 Other',    color: '#6b7280' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-10" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-[480px] bg-bg-popup border border-[#1e2d45] rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
          <div className="flex items-center gap-2">
            <Timer size={15} className="text-teal-400" />
            <span className="text-sm font-semibold text-white">{activeSession ? 'Session Running' : 'Start Session'}</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={15} /></button>
        </div>

        <div className="p-5 space-y-4">
          {!activeSession ? (
            <>
              {/* Type */}
              <div className="flex gap-2">
                {TYPE_OPTS.map(t => (
                  <button key={t.value} onClick={() => setType(t.value)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${type===t.value ? 'border-transparent text-white' : 'border-[#1e2d45] text-slate-500 hover:text-white bg-transparent'}`}
                    style={type===t.value ? { background: `${t.color}25`, borderColor: t.color } : {}}
                  >{t.label}</button>
                ))}
              </div>

              {/* Category */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-2">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => (
                    <button key={cat.id} onClick={() => setSelCat(cat.name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${selCat===cat.name ? 'text-white border-transparent' : 'border-[#1e2d45] text-slate-400 hover:text-white'}`}
                      style={selCat===cat.name ? { background: cat.color, borderColor: cat.color } : {}}
                    >{cat.name}</button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-2">What are you working on?</label>
                <input value={title} onChange={e=>setTitle(e.target.value)}
                  placeholder="Describe your session..."
                  className="w-full bg-[#1a2535] border border-[#1e2d45] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent"
                  onKeyDown={e=>e.key==='Enter'&&handleStart()}
                />
              </div>

              {/* Project */}
              {projects.length > 0 && (
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-2">Project (optional)</label>
                  <select value={projId} onChange={e=>setProjId(e.target.value)}
                    className="w-full bg-[#1a2535] border border-[#1e2d45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent">
                    <option value="">No project</option>
                    {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              <button onClick={handleStart} disabled={!selCat}
                className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-teal-500 disabled:bg-teal-800 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                <Play size={14} />Start Session
              </button>
            </>
          ) : (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-xl border border-green-500/25">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm text-green-300 font-medium">{activeSession.category} in progress</span>
              </div>
              {activeSession.title && <p className="text-sm text-slate-400">{activeSession.title}</p>}
              <button onClick={() => { onStop(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 bg-red-600/80 hover:bg-red-500 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                <Square size={13} fill="currentColor" />Stop Session
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
