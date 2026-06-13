import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Music, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward,
  X, ChevronDown, Shuffle, Radio, Heart, Sparkles, Zap,
  Coffee, BookOpen, Briefcase, PenLine, Brain,
} from 'lucide-react';

// ─── STATIONS ─────────────────────────────────────────────────────────────────

const STATIONS = [
  {
    id:         'groovesalad',
    label:      'Groove Salad',
    emoji:      '🌿',
    desc:       'Ambient beats · Downtempo',
    color:      '#34D399',
    gradient:   'linear-gradient(135deg, #064e3b, #065f46)',
    stream:     'https://ice6.somafm.com/groovesalad-128-mp3',
    tags:       ['Ambient', 'Deep Focus'],
    bestFor:    ['Deep Work', 'Writing'],
    focusScore: 92,
    category:   'ambient',
    mood:       'Calm & Focused',
  },
  {
    id:         'brainwave',
    label:      'Brain Wave',
    emoji:      '🧠',
    desc:       'Binaural focus frequencies',
    color:      '#7C6CF2',
    gradient:   'linear-gradient(135deg, #1e1b4b, #2d2a6b)',
    stream:     'https://ice6.somafm.com/brainwave-128-mp3',
    tags:       ['Binaural', 'Focus', 'Deep Work'],
    bestFor:    ['Deep Work', 'Study'],
    focusScore: 97,
    category:   'focus',
    mood:       'Deep Concentration',
  },
  {
    id:         'lofi',
    label:      'Lo-Fi Café',
    emoji:      '☕',
    desc:       'Chill hip-hop study vibes',
    color:      '#A78BFA',
    gradient:   'linear-gradient(135deg, #2e1065, #3b0764)',
    stream:     'https://ice6.somafm.com/fluid-128-mp3',
    tags:       ['Lo-Fi', 'Study', 'Chill'],
    bestFor:    ['Coding', 'Study'],
    focusScore: 88,
    category:   'lofi',
    mood:       'Creative Flow',
  },
  {
    id:         'deepspace',
    label:      'Deep Space',
    emoji:      '🌌',
    desc:       'Atmospheric & cinematic',
    color:      '#60A5FA',
    gradient:   'linear-gradient(135deg, #0c1445, #1e1b38)',
    stream:     'https://ice6.somafm.com/deepspaceone-128-mp3',
    tags:       ['Cinematic', 'Deep Focus', 'Ambient'],
    bestFor:    ['Creative Work', 'Writing'],
    focusScore: 89,
    category:   'ambient',
    mood:       'Immersive',
  },
  {
    id:         'classiccafe',
    label:      'Classic Café',
    emoji:      '🎻',
    desc:       'Chamber music & classical',
    color:      '#FBBF24',
    gradient:   'linear-gradient(135deg, #451a03, #713f12)',
    stream:     'https://ice6.somafm.com/classiccafe-128-mp3',
    tags:       ['Classical', 'Study'],
    bestFor:    ['Writing', 'Study', 'Deep Work'],
    focusScore: 90,
    category:   'classical',
    mood:       'Refined Focus',
  },
  {
    id:         'dronezone',
    label:      'Drone Zone',
    emoji:      '🧘',
    desc:       'Meditative & minimal drones',
    color:      '#C084FC',
    gradient:   'linear-gradient(135deg, #2e1065, #1a0533)',
    stream:     'https://ice6.somafm.com/dronezone-128-mp3',
    tags:       ['Meditation', 'Minimal', 'Ambient'],
    bestFor:    ['Meditation', 'Writing'],
    focusScore: 85,
    category:   'meditation',
    mood:       'Serene',
  },
  {
    id:         'electronic',
    label:      'Electronic',
    emoji:      '⚡',
    desc:       'Clean electronic · Techno',
    color:      '#22D3EE',
    gradient:   'linear-gradient(135deg, #0c4a6e, #164e63)',
    stream:     'https://ice6.somafm.com/digitalis-128-mp3',
    tags:       ['Electronic', 'Energy'],
    bestFor:    ['Coding', 'Energy Boost'],
    focusScore: 84,
    category:   'electronic',
    mood:       'Energised',
  },
  {
    id:         'spacestation',
    label:      'Space Station',
    emoji:      '🚀',
    desc:       'Space ambient & zero-gravity',
    color:      '#818CF8',
    gradient:   'linear-gradient(135deg, #0f0c29, #1a1758)',
    stream:     'https://ice6.somafm.com/spacestation-128-mp3',
    tags:       ['Space', 'Ambient', 'Deep Focus'],
    bestFor:    ['Deep Work', 'Meetings Recovery'],
    focusScore: 91,
    category:   'ambient',
    mood:       'Expansive',
  },
  {
    id:         'jazz',
    label:      'Jazz Lounge',
    emoji:      '🎷',
    desc:       'Smooth lounge & cocktail',
    color:      '#FB923C',
    gradient:   'linear-gradient(135deg, #431407, #7c2d12)',
    stream:     'https://ice6.somafm.com/illstreet-128-mp3',
    tags:       ['Jazz', 'Relaxed'],
    bestFor:    ['Meetings Recovery', 'Casual Work'],
    focusScore: 78,
    category:   'jazz',
    mood:       'Relaxed',
  },
  {
    id:         'sonicuniverse',
    label:      'Sonic Universe',
    emoji:      '🎺',
    desc:       'Jazz fusion & experimental',
    color:      '#F472B6',
    gradient:   'linear-gradient(135deg, #500724, #831843)',
    stream:     'https://ice6.somafm.com/sonicuniverse-128-mp3',
    tags:       ['Jazz', 'Fusion', 'Creative'],
    bestFor:    ['Creative Work', 'Design'],
    focusScore: 80,
    category:   'jazz',
    mood:       'Creative',
  },
  {
    id:         'shoegaze',
    label:      'Lush / Indie',
    emoji:      '🎸',
    desc:       'Dream-pop & shoegaze',
    color:      '#F472B6',
    gradient:   'linear-gradient(135deg, #500724, #4a044e)',
    stream:     'https://ice6.somafm.com/lush-128-mp3',
    tags:       ['Indie', 'Dream-pop', 'Creative'],
    bestFor:    ['Creative Work', 'Design'],
    focusScore: 76,
    category:   'indie',
    mood:       'Dreamy',
  },
  {
    id:         'worldbeat',
    label:      'World Beat',
    emoji:      '🌍',
    desc:       'Global rhythms & flow',
    color:      '#FB923C',
    gradient:   'linear-gradient(135deg, #431407, #3f3600)',
    stream:     'https://ice6.somafm.com/suburbsofgoa-128-mp3',
    tags:       ['World', 'Rhythmic', 'Energetic'],
    bestFor:    ['Energy Boost', 'Casual Work'],
    focusScore: 72,
    category:   'world',
    mood:       'Vibrant',
  },
];

const BEST_FOR_ICON = {
  'Deep Work':          Zap,
  'Coding':             Zap,
  'Writing':            PenLine,
  'Study':              BookOpen,
  'Creative Work':      Sparkles,
  'Design':             Sparkles,
  'Meditation':         Brain,
  'Meetings Recovery':  Coffee,
  'Energy Boost':       Zap,
  'Casual Work':        Briefcase,
};

const FAV_KEY = 'fl_music_favorites';
const loadFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } };
const saveFavs = (ids) => { try { localStorage.setItem(FAV_KEY, JSON.stringify(ids)); } catch {} };

// ─── SMART RECOMMENDATIONS ────────────────────────────────────────────────────

function getRecommended() {
  const h = new Date().getHours();
  let topIds;
  if      (h >= 6  && h < 10) topIds = ['brainwave','groovesalad','electronic','lofi'];
  else if (h >= 10 && h < 14) topIds = ['brainwave','classiccafe','deepspace','groovesalad'];
  else if (h >= 14 && h < 18) topIds = ['groovesalad','lofi','brainwave','spacestation'];
  else if (h >= 18 && h < 22) topIds = ['dronezone','deepspace','classiccafe','jazz'];
  else                         topIds = ['dronezone','spacestation','brainwave','deepspace'];
  return topIds.map(id => STATIONS.find(s => s.id === id)).filter(Boolean);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function useIsLight() {
  const [v, setV] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setV(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return v;
}

// ─── ARTWORK ──────────────────────────────────────────────────────────────────

function StationArt({ station, size = 44, playing = false, loading = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.22, flexShrink: 0,
      background: station.gradient,
      border: `1.5px solid ${station.color}35`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      boxShadow: playing ? `0 0 18px ${station.color}50` : 'none',
      transition: 'box-shadow 0.4s',
    }}>
      {/* Subtle radial glow overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 30% 30%, ${station.color}25, transparent 70%)`,
      }}/>
      {loading
        ? <div style={{
            width: size * 0.35, height: size * 0.35, borderRadius: '50%',
            border: `2px solid ${station.color}40`,
            borderTopColor: station.color,
            animation: 'fm-spin 0.8s linear infinite',
          }}/>
        : <span style={{ fontSize: size * 0.42, lineHeight: 1, position: 'relative' }}>{station.emoji}</span>
      }
    </div>
  );
}

// ─── EQ VISUALIZER ────────────────────────────────────────────────────────────

function EqBars({ color, active, bars = 5, size = 'md' }) {
  const h = size === 'sm' ? 10 : size === 'lg' ? 20 : 14;
  const w = size === 'sm' ? 2  : size === 'lg' ? 3  : 2.5;
  if (!active) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: size === 'sm' ? 1.5 : 2, height: h }}>
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} style={{
            width: w, height: h * (0.25 + (i % 3) * 0.15),
            borderRadius: w, background: color, opacity: 0.3,
          }}/>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: size === 'sm' ? 1.5 : 2, height: h }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          width: w, borderRadius: w, background: color,
          animation: `fm-eq ${0.45 + i * 0.1}s ease-in-out ${i * 0.06}s infinite alternate`,
          minHeight: 3,
        }}/>
      ))}
    </div>
  );
}

// ─── FOCUS BADGE ──────────────────────────────────────────────────────────────

function FocusBadge({ label, color }) {
  const Icon = BEST_FOR_ICON[label] || Zap;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 999,
      background: `${color}15`, border: `1px solid ${color}30`,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={9} color={color}/>
      <span style={{ fontSize: 9.5, fontWeight: 700, color, letterSpacing: '0.04em' }}>{label}</span>
    </div>
  );
}

// ─── TAG CHIP ─────────────────────────────────────────────────────────────────

function TagChip({ label, isLight }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 600,
      padding: '2px 7px', borderRadius: 999,
      background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)',
      color: isLight ? '#6B7280' : '#9CA3AF',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ─── FOCUS SCORE BAR ──────────────────────────────────────────────────────────

function FocusScoreBar({ score, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${score}%`, borderRadius: 2,
          background: `linear-gradient(90deg, ${color}90, ${color})`,
          transition: 'width 0.6s ease',
        }}/>
      </div>
      <span style={{ fontSize: 9.5, fontWeight: 700, color, width: 24, textAlign: 'right' }}>{score}</span>
    </div>
  );
}

// ─── NOW PLAYING CARD ─────────────────────────────────────────────────────────

function NowPlayingCard({
  station, playing, loading, muted, volume,
  onTogglePlay, onMute, onPrev, onNext, onShuffle, onVolumeChange, isLight, shuffled,
}) {
  const [volHover, setVolHover] = useState(false);

  const btnBase = {
    background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', borderRadius: 8, padding: 6,
    transition: 'background 0.15s, transform 0.1s',
  };
  const ctrlColor = isLight ? '#374151' : 'rgba(255,255,255,0.75)';
  const mutedCtrlColor = isLight ? '#9CA3AF' : 'rgba(255,255,255,0.28)';

  return (
    <div style={{
      margin: '0 12px 12px', borderRadius: 16,
      background: station
        ? `linear-gradient(160deg, ${station.color}22 0%, ${isLight ? 'rgba(255,255,255,0.4)' : 'rgba(13,15,22,0.9)'} 60%)`
        : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)'),
      border: `1px solid ${station ? station.color + '30' : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)')}`,
      backdropFilter: 'blur(12px)',
      overflow: 'hidden',
    }}>
      {/* Artwork row */}
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {station
          ? <StationArt station={station} size={56} playing={playing && !loading} loading={loading}/>
          : (
            <div style={{
              width: 56, height: 56, borderRadius: 12, flexShrink: 0,
              background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)',
              border: `1.5px solid ${isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.08)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Radio size={20} color={isLight ? '#9CA3AF' : '#4B5563'}/>
            </div>
          )
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em',
            color: isLight ? '#111827' : '#ffffff', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {station ? station.label : 'Not Playing'}
          </p>
          {station && (
            <p style={{ fontSize: 11.5, color: isLight ? '#6B7280' : '#9CA3AF', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {station.desc}
            </p>
          )}
          {station && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
              <EqBars color={station.color} active={playing && !loading} bars={5} size="sm"/>
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: playing && !loading ? station.color : (isLight ? '#9CA3AF' : '#4B5563'),
              }}>
                {loading ? 'Buffering…' : playing ? 'Live · SomaFM' : 'Paused'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Best For badge + focus score */}
      {station && (
        <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {station.bestFor.slice(0, 2).map(b => <FocusBadge key={b} label={b} color={station.color}/>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 9.5, color: isLight ? '#9CA3AF' : '#6B7280', whiteSpace: 'nowrap' }}>Focus</span>
            <div style={{
              width: 36, height: 3, borderRadius: 2,
              background: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${station.focusScore}%`,
                background: `linear-gradient(90deg, ${station.color}80, ${station.color})`,
              }}/>
            </div>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: station.color }}>{station.focusScore}</span>
          </div>
        </div>
      )}

      {/* Controls row */}
      <div style={{
        padding: '8px 10px 10px',
        borderTop: `1px solid ${station ? station.color + '18' : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)')}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Left: shuffle */}
        <button onClick={onShuffle} title="Shuffle" style={{
          ...btnBase,
          color: shuffled ? (station?.color || '#7C6CF2') : mutedCtrlColor,
        }}
          onMouseEnter={e => e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <Shuffle size={13}/>
        </button>

        {/* Center: prev / play / next */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={onPrev} title="Previous" style={{ ...btnBase, color: ctrlColor }}
            onMouseEnter={e => e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <SkipBack size={15}/>
          </button>

          <button onClick={onTogglePlay} title={playing ? 'Pause' : 'Play'} style={{
            width: 38, height: 38, borderRadius: '50%',
            background: station ? station.color : '#7C6CF2',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 16px ${(station?.color || '#7C6CF2')}50`,
            transition: 'transform 0.12s, box-shadow 0.2s',
            flexShrink: 0,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = `0 6px 22px ${(station?.color || '#7C6CF2')}65`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';    e.currentTarget.style.boxShadow = `0 4px 16px ${(station?.color || '#7C6CF2')}50`; }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
            onMouseUp={e   => e.currentTarget.style.transform = 'scale(1.06)'}
          >
            {playing
              ? <Pause size={16} fill="white" color="white"/>
              : <Play  size={16} fill="white" color="white" style={{ marginLeft: 2 }}/>
            }
          </button>

          <button onClick={onNext} title="Next" style={{ ...btnBase, color: ctrlColor }}
            onMouseEnter={e => e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <SkipForward size={15}/>
          </button>
        </div>

        {/* Right: volume */}
        <button onClick={onMute} title={muted ? 'Unmute' : 'Mute'} style={{
          ...btnBase, color: muted ? mutedCtrlColor : ctrlColor,
        }}
          onMouseEnter={e => e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          {muted || volume === 0 ? <VolumeX size={13}/> : <Volume2 size={13}/>}
        </button>
      </div>

      {/* Volume slider */}
      <div style={{
        padding: '0 14px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1, position: 'relative', height: 4 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 2,
            background: isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
          }}/>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${volume * 100}%`, borderRadius: 2,
            background: station ? `linear-gradient(90deg, ${station.color}80, ${station.color})` : 'linear-gradient(90deg, #7C6CF280, #7C6CF2)',
            transition: 'width 0.05s',
          }}/>
          <input type="range" min="0" max="1" step="0.02"
            value={volume}
            onChange={e => onVolumeChange(e.target.value)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: 0, cursor: 'pointer', margin: 0, padding: 0,
            }}
          />
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: isLight ? '#9CA3AF' : '#6B7280', width: 22, textAlign: 'right', flexShrink: 0 }}>
          {Math.round(volume * 100)}
        </span>
      </div>
    </div>
  );
}

// ─── STATION CARD ─────────────────────────────────────────────────────────────

function StationCard({ station, isActive, playing, loading, isFav, onPlay, onFav, isLight }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPlay(station)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 12, cursor: 'pointer',
        background: isActive
          ? (isLight ? `${station.color}12` : `${station.color}15`)
          : hovered
            ? (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)')
            : 'transparent',
        border: `1px solid ${isActive ? station.color + '35' : 'transparent'}`,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <StationArt station={station} size={40} playing={isActive && playing && !loading} loading={isActive && loading}/>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 12.5, fontWeight: 700, color: isLight ? '#111827' : '#E5E7EB',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {station.label}
          </span>
          {isActive && playing && !loading && (
            <EqBars color={station.color} active bars={3} size="sm"/>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
          {station.tags.slice(0, 2).map(t => <TagChip key={t} label={t} isLight={isLight}/>)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Focus score pill */}
        <div style={{
          padding: '2px 7px', borderRadius: 999, flexShrink: 0,
          background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
          opacity: hovered || isActive ? 1 : 0.6,
          transition: 'opacity 0.15s',
        }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: station.color }}>{station.focusScore}</span>
        </div>

        {/* Fav button */}
        <button
          onClick={e => { e.stopPropagation(); onFav(station.id); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 3,
            color: isFav ? '#F472B6' : (isLight ? '#D1D5DB' : '#374151'),
            opacity: hovered || isFav ? 1 : 0,
            transition: 'opacity 0.15s, color 0.15s',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Heart size={12} fill={isFav ? '#F472B6' : 'none'}/>
        </button>
      </div>
    </div>
  );
}

// ─── RECOMMENDATION CARD (compact) ───────────────────────────────────────────

function RecoCard({ station, isActive, playing, loading, onPlay, isLight }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPlay(station)}
      style={{
        flex: '0 0 auto', width: 120,
        padding: '10px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', border: 'none',
        background: isActive
          ? `${station.color}20`
          : hovered
            ? (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)')
            : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
        outline: `1px solid ${isActive ? station.color + '40' : 'transparent'}`,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <StationArt station={station} size={52} playing={isActive && playing} loading={isActive && loading}/>
      </div>
      <p style={{
        fontSize: 11.5, fontWeight: 700, color: isLight ? '#111827' : '#E5E7EB', margin: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {station.label}
      </p>
      <p style={{
        fontSize: 10, color: isLight ? '#9CA3AF' : '#6B7280', margin: '2px 0 0',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {station.mood}
      </p>
      {isActive && playing && !loading && (
        <div style={{ marginTop: 5 }}>
          <EqBars color={station.color} active bars={4} size="sm"/>
        </div>
      )}
    </button>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function FocusMusic({ show = true, onClose }) {
  const [selected,  setSelected]  = useState(null);
  const [playing,   setPlaying]   = useState(false);
  const [volume,    setVolume]    = useState(0.65);
  const [muted,     setMuted]     = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [tab,       setTab]       = useState('foryou');
  const [shuffled,  setShuffled]  = useState(false);
  const [favs,      setFavs]      = useState(loadFavs);
  const isLight = useIsLight();

  const audioRef    = useRef(null);
  const prevVolRef  = useRef(0.65);
  const togglePlayRef = useRef(null);
  const toggleMuteRef = useRef(null);

  const recommended = useMemo(() => getRecommended(), []);

  // ── Event bridge ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const station = STATIONS.find(s => s.id === selected) || null;
    window.__flMusicState = { station, playing, volume, muted, loading };
    window.dispatchEvent(new Event('fl-music-update'));
  }, [selected, playing, volume, muted, loading]);

  useEffect(() => () => {
    window.__flMusicState = null;
    window.dispatchEvent(new Event('fl-music-update'));
  }, []);

  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => { toggleMuteRef.current = toggleMute; });

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === 'toggle') togglePlayRef.current?.();
      if (e.detail?.action === 'mute')   toggleMuteRef.current?.();
    };
    window.addEventListener('fl-music-cmd', handler);
    return () => window.removeEventListener('fl-music-cmd', handler);
  }, []);

  // ── Audio element ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload  = 'none';
    audio.volume   = 0.65;
    audioRef.current = audio;
    const onWaiting = () => setLoading(true);
    const onPlaying = () => { setLoading(false); setError(''); };
    const onError   = () => { setLoading(false); setError('Stream unavailable — try another station'); setPlaying(false); };
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('error',   onError);
    return () => {
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error',   onError);
      audio.pause(); audio.src = '';
    };
  }, []);

  // ── Playback ─────────────────────────────────────────────────────────────────
  const play = useCallback((station) => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(''); setLoading(true);
    if (audio.src !== station.stream) {
      audio.pause(); audio.src = station.stream; audio.volume = muted ? 0 : volume;
    }
    audio.play().catch(() => { setError('Could not start stream'); setLoading(false); setPlaying(false); });
    setPlaying(true); setSelected(station.id);
  }, [muted, volume]);

  const pause = useCallback(() => {
    audioRef.current?.pause(); setPlaying(false); setLoading(false);
  }, []);

  const handleStationClick = useCallback((station) => {
    if (selected === station.id && playing) pause(); else play(station);
  }, [selected, playing, play, pause]);

  const togglePlay = useCallback(() => {
    if (playing) { pause(); return; }
    const station = STATIONS.find(s => s.id === selected);
    if (station) play(station);
  }, [playing, selected, play, pause]);

  const handleVolume = useCallback((val) => {
    const v = parseFloat(val);
    setVolume(v);
    if (v > 0) prevVolRef.current = v;
    if (audioRef.current) audioRef.current.volume = v;
    setMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (muted) {
      const v = prevVolRef.current || 0.65;
      setMuted(false); setVolume(v);
      if (audioRef.current) audioRef.current.volume = v;
    } else {
      prevVolRef.current = volume; setMuted(true); setVolume(0);
      if (audioRef.current) audioRef.current.volume = 0;
    }
  }, [muted, volume]);

  const handlePrev = useCallback(() => {
    const idx = STATIONS.findIndex(s => s.id === selected);
    const prev = STATIONS[(idx - 1 + STATIONS.length) % STATIONS.length];
    play(prev);
  }, [selected, play]);

  const handleNext = useCallback(() => {
    if (shuffled) {
      const others = STATIONS.filter(s => s.id !== selected);
      play(others[Math.floor(Math.random() * others.length)]);
    } else {
      const idx  = STATIONS.findIndex(s => s.id === selected);
      const next = STATIONS[(idx + 1) % STATIONS.length];
      play(next);
    }
  }, [selected, shuffled, play]);

  const toggleFav = useCallback((id) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      saveFavs(next); return next;
    });
  }, []);

  const activeStation = STATIONS.find(s => s.id === selected) || null;
  const favStations   = STATIONS.filter(s => favs.includes(s.id));

  if (!show) return null;

  // ── Theme tokens ─────────────────────────────────────────────────────────────
  const panelBg   = isLight ? '#FFFFFF' : '#0D0F16';
  const panelBrd  = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.07)';
  const headerBg  = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,15,22,0.95)';
  const divider   = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
  const tabActive = activeStation?.color || '#7C6CF2';

  // ── Collapsed pill ───────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div style={{
        position: 'fixed', bottom: 88, right: 24, zIndex: 50,
        background: panelBg, border: `1px solid ${panelBrd}`,
        borderRadius: 16, boxShadow: isLight
          ? '0 8px 32px rgba(0,0,0,0.12)'
          : '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        overflow: 'hidden',
      }}>
        <style>{FM_STYLES}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
          <StationArt station={activeStation || STATIONS[0]} size={32}
            playing={playing && !loading} loading={loading}/>
          <div style={{ flex: 1, minWidth: 0, maxWidth: 140 }}>
            {activeStation
              ? <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: isLight ? '#111827' : '#ffffff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeStation.label}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <EqBars color={activeStation.color} active={playing && !loading} bars={4} size="sm"/>
                    <span style={{ fontSize: 9.5, color: isLight ? '#9CA3AF' : '#6B7280' }}>
                      {loading ? 'Buffering…' : playing ? 'Live' : 'Paused'}
                    </span>
                  </div>
                </>
              : <p style={{ fontSize: 12, fontWeight: 600, color: isLight ? '#6B7280' : '#9CA3AF', margin: 0 }}>Focus Music</p>
            }
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {activeStation && (
              <button onClick={togglePlay} style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                background: activeStation.color, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 2px 8px ${activeStation.color}50`,
              }}>
                {playing ? <Pause size={11} fill="white" color="white"/> : <Play size={11} fill="white" color="white" style={{ marginLeft: 1 }}/>}
              </button>
            )}
            <button onClick={() => setCollapsed(false)} style={{
              width: 28, height: 28, borderRadius: 8, border: `1px solid ${divider}`,
              background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isLight ? '#9CA3AF' : '#6B7280',
            }}>
              <Music size={12}/>
            </button>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isLight ? '#9CA3AF' : '#4B5563',
            }}>
              <X size={12}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full panel ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 88, right: 24, zIndex: 50,
      width: 340, maxHeight: '88vh',
      display: 'flex', flexDirection: 'column',
      background: panelBg,
      border: `1px solid ${panelBrd}`,
      borderRadius: 20,
      boxShadow: isLight
        ? '0 16px 48px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.06)'
        : '0 24px 64px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.04)',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      <style>{FM_STYLES}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 14px 12px',
        background: headerBg,
        borderBottom: `1px solid ${divider}`,
        backdropFilter: 'blur(8px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: activeStation ? `${activeStation.color}20` : 'rgba(124,108,242,0.15)',
            border: `1px solid ${activeStation ? activeStation.color + '35' : 'rgba(124,108,242,0.3)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Music size={13} color={activeStation?.color || '#7C6CF2'}/>
          </div>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: isLight ? '#111827' : '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
              Focus Music
            </p>
            <p style={{ fontSize: 10, color: isLight ? '#9CA3AF' : '#4B5563', margin: 0 }}>
              Free · No account · SomaFM
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Status dot */}
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: playing && !loading ? '#34D399' : (isLight ? '#D1D5DB' : '#374151'),
            boxShadow: playing && !loading ? '0 0 6px rgba(52,211,153,0.6)' : 'none',
            transition: 'all 0.3s', marginRight: 4,
          }}/>
          <button onClick={() => setCollapsed(true)} style={{
            width: 26, height: 26, borderRadius: 7, border: `1px solid ${divider}`,
            background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isLight ? '#9CA3AF' : '#6B7280',
          }}>
            <ChevronDown size={13}/>
          </button>
          <button onClick={onClose} style={{
            width: 26, height: 26, borderRadius: 7, border: 'none',
            background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isLight ? '#9CA3AF' : '#6B7280',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#F87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = isLight ? '#9CA3AF' : '#6B7280'; e.currentTarget.style.background = 'none'; }}
          >
            <X size={13}/>
          </button>
        </div>
      </div>

      {/* ── Now Playing ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 0 0', flexShrink: 0 }}>
        <NowPlayingCard
          station={activeStation} playing={playing} loading={loading}
          muted={muted} volume={volume} shuffled={shuffled} isLight={isLight}
          onTogglePlay={togglePlay} onMute={toggleMute}
          onPrev={handlePrev} onNext={handleNext}
          onShuffle={() => setShuffled(v => !v)}
          onVolumeChange={handleVolume}
        />
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          margin: '0 12px 10px', padding: '8px 12px', borderRadius: 10,
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.22)',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: 11.5, color: '#F87171', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', padding: '0 12px 0', gap: 2,
        borderBottom: `1px solid ${divider}`, flexShrink: 0,
      }}>
        {[
          { id: 'foryou',   label: 'For You'  },
          { id: 'browse',   label: 'Browse'   },
          { id: 'saved',    label: `Saved${favs.length ? ` (${favs.length})` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 10px 8px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? tabActive : (isLight ? '#9CA3AF' : '#6B7280'),
            borderBottom: `2px solid ${tab === t.id ? tabActive : 'transparent'}`,
            marginBottom: -1, transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab body (scrollable) ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

        {/* FOR YOU */}
        {tab === 'foryou' && (
          <div style={{ padding: '12px 0 6px' }}>
            {/* AI rec label */}
            <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={11} color="#A78BFA"/>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#A78BFA' }}>
                Recommended for you
              </span>
            </div>

            {/* Horizontal reco row */}
            <div style={{
              display: 'flex', gap: 8, padding: '0 12px 14px',
              overflowX: 'auto', scrollbarWidth: 'none',
            }}>
              {recommended.map(s => (
                <RecoCard key={s.id} station={s}
                  isActive={selected === s.id} playing={playing} loading={loading}
                  onPlay={handleStationClick} isLight={isLight}/>
              ))}
            </div>

            <div style={{ height: 1, background: divider, margin: '0 12px 12px' }}/>

            {/* Focus intelligence section */}
            <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={11} color="#FBBF24"/>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#FBBF24' }}>
                Focus intelligence
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 4px' }}>
              {[
                { label: 'Best for Deep Work',    ids: ['brainwave','groovesalad'],  color: '#7C6CF2' },
                { label: 'Best for Coding',       ids: ['lofi','electronic'],        color: '#22D3EE' },
                { label: 'Best for Writing',      ids: ['classiccafe','dronezone'],  color: '#34D399' },
                { label: 'Best for Creative Work',ids: ['deepspace','sonicuniverse'],color: '#F472B6' },
              ].map(({ label, ids, color }) => {
                const station = STATIONS.find(s => ids.includes(s.id) && s.id !== selected) || STATIONS.find(s => ids.includes(s.id));
                if (!station) return null;
                return (
                  <button key={label} onClick={() => handleStationClick(station)} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 12px', borderRadius: 10, border: 'none',
                    background: 'none', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <FocusBadge label={label.replace('Best for ', '')} color={color}/>
                    <span style={{ flex: 1, fontSize: 11.5, color: isLight ? '#6B7280' : '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      → {station.label}
                    </span>
                    {selected === station.id && playing && <EqBars color={station.color} active bars={3} size="sm"/>}
                  </button>
                );
              })}
            </div>
            <div style={{ height: 8 }}/>
          </div>
        )}

        {/* BROWSE */}
        {tab === 'browse' && (
          <div style={{ padding: '10px 4px 8px' }}>
            {/* Categories */}
            {[
              { label: 'Ambient & Deep Focus', ids: ['groovesalad','brainwave','deepspace','spacestation','dronezone'] },
              { label: 'Lo-Fi & Study',        ids: ['lofi','classiccafe'] },
              { label: 'Electronic & Energy',  ids: ['electronic'] },
              { label: 'Jazz & Creative',      ids: ['jazz','sonicuniverse','shoegaze','worldbeat'] },
            ].map(cat => (
              <div key={cat.label} style={{ marginBottom: 6 }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: isLight ? '#9CA3AF' : '#4B5563',
                  padding: '0 12px', marginBottom: 2,
                }}>
                  {cat.label}
                </p>
                {STATIONS.filter(s => cat.ids.includes(s.id)).map(s => (
                  <StationCard key={s.id} station={s}
                    isActive={selected === s.id} playing={playing} loading={loading}
                    isFav={favs.includes(s.id)}
                    onPlay={handleStationClick} onFav={toggleFav} isLight={isLight}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* SAVED */}
        {tab === 'saved' && (
          <div style={{ padding: '10px 4px 8px' }}>
            {favStations.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <Heart size={28} color={isLight ? '#D1D5DB' : '#374151'} style={{ margin: '0 auto 12px' }}/>
                <p style={{ fontSize: 13, fontWeight: 600, color: isLight ? '#9CA3AF' : '#6B7280', margin: '0 0 4px' }}>
                  No saved stations
                </p>
                <p style={{ fontSize: 11.5, color: isLight ? '#D1D5DB' : '#374151', margin: 0 }}>
                  Hover a station and tap ♡ to save it here
                </p>
              </div>
            ) : favStations.map(s => (
              <StationCard key={s.id} station={s}
                isActive={selected === s.id} playing={playing} loading={loading}
                isFav onPlay={handleStationClick} onFav={toggleFav} isLight={isLight}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 14px', borderTop: `1px solid ${divider}`, flexShrink: 0,
        background: isLight ? 'rgba(249,250,251,0.8)' : 'rgba(9,11,18,0.8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: playing && !loading ? '#34D399' : (isLight ? '#D1D5DB' : '#374151'),
            boxShadow: playing && !loading ? '0 0 6px rgba(52,211,153,0.5)' : 'none',
          }}/>
          <span style={{ fontSize: 10.5, color: isLight ? '#9CA3AF' : '#6B7280', fontWeight: 500 }}>
            {playing && !loading ? `Streaming · ${activeStation?.label}` : loading ? 'Buffering…' : 'Ready'}
          </span>
        </div>
        <span style={{ fontSize: 10, color: isLight ? '#D1D5DB' : '#374151' }}>SomaFM</span>
      </div>
    </div>
  );
}

// ─── INJECTED STYLES ──────────────────────────────────────────────────────────

const FM_STYLES = `
  @keyframes fm-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes fm-eq {
    from { height: 3px; }
    to   { height: 14px; }
  }
  [style*="fm-eq-sm"] { }
`;
