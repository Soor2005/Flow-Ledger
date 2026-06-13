import React, { useState, useEffect, useRef } from 'react';

// ─── App name → canonical domain map ─────────────────────────────────────────
// Keys are lower-case exact process / app names.
// Token-based matching (not substring) prevents "codex" → "code" false hits.
const APP_DOMAIN_MAP = {
  // ── Browsers ──────────────────────────────────────────────────────────────
  'chrome':               'google.com/chrome',
  'google chrome':        'google.com/chrome',
  'firefox':              'mozilla.org',
  'mozilla firefox':      'mozilla.org',
  'safari':               'apple.com',
  'edge':                 'microsoft.com/edge',
  'microsoft edge':       'microsoft.com/edge',
  'brave':                'brave.com',
  'brave browser':        'brave.com',
  'arc':                  'arc.net',
  'arc browser':          'arc.net',
  'opera':                'opera.com',
  'vivaldi':              'vivaldi.com',
  'tor browser':          'torproject.org',
  'orion':                'browser.kagi.com',

  // ── Design ────────────────────────────────────────────────────────────────
  'figma':                'figma.com',
  'sketch':               'sketch.com',
  'canva':                'canva.com',
  'photoshop':            'adobe.com',
  'adobe photoshop':      'adobe.com',
  'illustrator':          'adobe.com',
  'adobe illustrator':    'adobe.com',
  'adobe xd':             'adobe.com',
  'adobe premiere':       'adobe.com',
  'adobe after effects':  'adobe.com',
  'after effects':        'adobe.com',
  'premiere pro':         'adobe.com',
  'lightroom':            'adobe.com',
  'adobe lightroom':      'adobe.com',
  'framer':               'framer.com',
  'invision':             'invisionapp.com',
  'invision studio':      'invisionapp.com',
  'zeplin':               'zeplin.io',
  'affinity designer':    'affinity.serif.com',
  'affinity photo':       'affinity.serif.com',
  'affinity publisher':   'affinity.serif.com',
  'procreate':            'procreate.art',
  'miro':                 'miro.com',
  'pixelmator':           'pixelmator.com',
  'pixelmator pro':       'pixelmator.com',
  'principle':            'principleformac.com',
  'overflow':             'overflow.io',
  'spline':               'spline.design',

  // ── IDEs / Code editors ───────────────────────────────────────────────────
  'code':                 'code.visualstudio.com',   // macOS process name for VS Code
  'vscode':               'code.visualstudio.com',
  'visual studio code':   'code.visualstudio.com',
  'visual studio':        'visualstudio.com',
  'cursor':               'cursor.com',
  'windsurf':             'codeium.com',
  'zed':                  'zed.dev',
  'intellij idea':        'jetbrains.com/idea',
  'intellij':             'jetbrains.com',
  'webstorm':             'jetbrains.com/webstorm',
  'pycharm':              'jetbrains.com/pycharm',
  'phpstorm':             'jetbrains.com/phpstorm',
  'goland':               'jetbrains.com/go',
  'clion':                'jetbrains.com/clion',
  'rider':                'jetbrains.com/rider',
  'datagrip':             'jetbrains.com/datagrip',
  'rubymine':             'jetbrains.com/ruby',
  'xcode':                'developer.apple.com',
  'android studio':       'developer.android.com/studio',
  'eclipse':              'eclipse.org',
  'netbeans':             'netbeans.apache.org',
  'sublime text':         'sublimetext.com',
  'sublime':              'sublimetext.com',
  'atom':                 'atom.io',
  'vim':                  'vim.org',
  'neovim':               'neovim.io',
  'nvim':                 'neovim.io',
  'emacs':                'gnu.org',
  'nova':                 'nova.app',
  'bbedit':               'barebones.com',
  'textmate':             'macromates.com',

  // ── Dev tools ─────────────────────────────────────────────────────────────
  'postman':              'postman.com',
  'insomnia':             'insomnia.rest',
  'paw':                  'paw.cloud',
  'tableplus':            'tableplus.com',
  'dbeaver':              'dbeaver.io',
  'sequel pro':           'sequelpro.com',
  'sequel ace':           'sequel-ace.com',
  'beekeeper studio':     'beekeeperstudio.io',
  'mongodb compass':      'mongodb.com',
  'github desktop':       'github.com',
  'sourcetree':           'sourcetreeapp.com',
  'gitkraken':            'gitkraken.com',
  'fork':                 'git-fork.com',
  'tower':                'git-tower.com',
  'docker':               'docker.com',
  'docker desktop':       'docker.com',
  'proxyman':             'proxyman.io',
  'charles':              'charlesproxy.com',
  'cyberduck':            'cyberduck.io',
  'transmit':             'panic.com',
  'filezilla':            'filezilla-project.org',
  'virtualbox':           'virtualbox.org',
  'parallels':            'parallels.com',

  // ── Terminals ─────────────────────────────────────────────────────────────
  'terminal':             'apple.com',
  'iterm':                'iterm2.com',
  'iterm2':               'iterm2.com',
  'warp':                 'warp.dev',
  'alacritty':            'alacritty.org',
  'kitty':                'sw.kovidgoyal.net',
  'windows terminal':     'microsoft.com',
  'hyper':                'hyper.is',
  'tabby':                'tabby.sh',

  // ── Communication ─────────────────────────────────────────────────────────
  'slack':                'slack.com',
  'discord':              'discord.com',
  'zoom':                 'zoom.us',
  'zoom.us':              'zoom.us',
  'microsoft teams':      'teams.microsoft.com',
  'teams':                'teams.microsoft.com',
  'webex':                'webex.com',
  'telegram':             'telegram.org',
  'whatsapp':             'whatsapp.com',
  'signal':               'signal.org',
  'loom':                 'loom.com',
  'gather':               'gather.town',
  'whereby':              'whereby.com',
  'google meet':          'meet.google.com',
  'google chat':          'chat.google.com',
  'skype':                'skype.com',
  'facetime':             'apple.com',
  'messages':             'apple.com',
  'beeper':               'beeper.com',

  // ── Productivity / Notes ──────────────────────────────────────────────────
  'notion':               'notion.so',
  'obsidian':             'obsidian.md',
  'roam':                 'roamresearch.com',
  'roam research':        'roamresearch.com',
  'logseq':               'logseq.com',
  'bear':                 'bear.app',
  'craft':                'craft.do',
  'day one':              'dayoneapp.com',
  'ulysses':              'ulysses.app',
  'drafts':               'getdrafts.com',
  'evernote':             'evernote.com',
  'onenote':              'microsoft.com',
  'google docs':          'docs.google.com',
  'google sheets':        'sheets.google.com',
  'google slides':        'slides.google.com',
  'google keep':          'keep.google.com',
  'scrivener':            'literatureandlatte.com',
  'ia writer':            'ia.net',
  'typora':               'typora.io',
  'mem':                  'mem.ai',
  'capacities':           'capacities.io',
  'tana':                 'tana.inc',
  'anytype':              'anytype.io',

  // ── Task / Project management ─────────────────────────────────────────────
  'linear':               'linear.app',
  'jira':                 'atlassian.com',
  'confluence':           'atlassian.com',
  'asana':                'asana.com',
  'trello':               'trello.com',
  'clickup':              'clickup.com',
  'todoist':              'todoist.com',
  'things':               'culturedcode.com',
  'things 3':             'culturedcode.com',
  'basecamp':             'basecamp.com',
  'monday':               'monday.com',
  'monday.com':           'monday.com',
  'height':               'height.app',
  'shortcut':             'shortcut.com',
  'sunsama':              'sunsama.com',
  'ticktick':             'ticktick.com',
  'omnifocus':            'omnigroup.com',
  'reminders':            'apple.com',

  // ── Office / Documents ────────────────────────────────────────────────────
  'microsoft word':       'microsoft.com',
  'word':                 'microsoft.com',
  'microsoft excel':      'microsoft.com',
  'excel':                'microsoft.com',
  'microsoft powerpoint': 'microsoft.com',
  'powerpoint':           'microsoft.com',
  'microsoft outlook':    'microsoft.com',
  'outlook':              'microsoft.com',
  'pages':                'apple.com',
  'numbers':              'apple.com',
  'keynote':              'apple.com',
  'libreoffice':          'libreoffice.org',

  // ── Email ─────────────────────────────────────────────────────────────────
  'mail':                 'apple.com',
  'gmail':                'gmail.com',
  'airmail':              'airmailapp.com',
  'airmail 5':            'airmailapp.com',
  'mimestream':           'mimestream.com',
  'superhuman':           'superhuman.com',
  'spark':                'sparkmailapp.com',
  'hey':                  'hey.com',
  'protonmail':           'proton.me',
  'thunderbird':          'thunderbird.net',
  'missive':              'missiveapp.com',

  // ── Calendar ──────────────────────────────────────────────────────────────
  'calendar':             'apple.com',
  'fantastical':          'flexibits.com',
  'busycal':              'busymac.com',
  'google calendar':      'calendar.google.com',

  // ── Media / Music ─────────────────────────────────────────────────────────
  'spotify':              'spotify.com',
  'apple music':          'music.apple.com',
  'youtube music':        'music.youtube.com',
  'vlc':                  'videolan.org',
  'vlc media player':     'videolan.org',
  'quicktime':            'apple.com',
  'quicktime player':     'apple.com',
  'iina':                 'iina.io',
  'plex':                 'plex.tv',
  'handbrake':            'handbrake.fr',
  'final cut pro':        'apple.com',
  'final cut':            'apple.com',
  'davinci resolve':      'blackmagicdesign.com',
  'logic pro':            'apple.com',
  'logic':                'apple.com',
  'garageband':           'apple.com',
  'audacity':             'audacityteam.org',
  'ableton':              'ableton.com',
  'ableton live':         'ableton.com',

  // ── AI / Launchers ────────────────────────────────────────────────────────
  'chatgpt':              'openai.com',
  'codex':                'openai.com',
  'openai codex':         'openai.com',
  'claude':               'anthropic.com',
  'perplexity':           'perplexity.ai',
  'raycast':              'raycast.com',
  'alfred':               'alfredapp.com',
  'keyboard maestro':     'keyboardmaestro.com',
  'bartender':            'macbartender.com',
  'cleanmymac':           'macpaw.com',
  'setapp':               'setapp.com',

  // ── Cloud storage / Files ─────────────────────────────────────────────────
  '1password':            '1password.com',
  'dropbox':              'dropbox.com',
  'google drive':         'drive.google.com',
  'onedrive':             'microsoft.com',
  'box':                  'box.com',
  'finder':               'apple.com',

  // ── System ────────────────────────────────────────────────────────────────
  'system preferences':   'apple.com',
  'system settings':      'apple.com',
  'activity monitor':     'apple.com',

  // ── Windows process names (exe without extension) ─────────────────────────
  'powerpnt':             'microsoft.com',       // PowerPoint
  'winword':              'microsoft.com',       // Word
  'msaccess':             'microsoft.com',       // Access
  'mspub':                'microsoft.com',       // Publisher
  'winproj':              'microsoft.com',       // Project
  'msedge':               'microsoft.com/edge', // Edge
  'devenv':               'visualstudio.com',   // Visual Studio

  // ── Gaming platforms ─────────────────────────────────────────────────────
  'steam':                'steampowered.com',
  'steamwebhelper':       'steampowered.com',
  'epicgameslauncher':    'epicgames.com',
  'epicgames':            'epicgames.com',
  'epic games':           'epicgames.com',
  'origin':               'ea.com',
  'eadesktop':            'ea.com',
  'ea app':               'ea.com',
  'battle.net':           'battle.net',
  'battlenet':            'battle.net',
  'galaxyclient':         'gog.com',
  'gog galaxy':           'gog.com',
  'uplay':                'ubisoft.com',
  'ubisoft connect':      'ubisoft.com',
  'riotclientservices':   'riotgames.com',
  'leagueclient':         'leagueoflegends.com',
  'opera_gx':             'opera.com',

  // ── Social / content ─────────────────────────────────────────────────────
  'twitter':              'twitter.com',
  'x':                    'twitter.com',
  'reddit':               'reddit.com',
  'instagram':            'instagram.com',
  'facebook':             'facebook.com',
  'tiktok':               'tiktok.com',
  'snapchat':             'snapchat.com',
  'pinterest':            'pinterest.com',
  'linkedin':             'linkedin.com',
  'youtube':              'youtube.com',
  'twitch':               'twitch.tv',
};

// ─── Resolve domain for favicon/logo lookup ───────────────────────────────────
function resolveDomain(appName, url) {
  // URL wins — most accurate for web apps
  if (url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { /* fall through */ }
  }
  const key = (appName || '').toLowerCase().trim()
    .replace(/\.exe$/i, '').replace(/\s+/g, ' ');

  // 1. Exact match
  if (APP_DOMAIN_MAP[key]) return APP_DOMAIN_MAP[key];

  // 2. Token match — every token of the map key must be a whole token in key.
  //    "codex" → tokens ["codex"]; map key "code" → ["code"]; "code" ≠ "codex" → no match.
  const keyTokens = new Set(key.split(/[\s\-_.]+/).filter(Boolean));
  const entries = Object.entries(APP_DOMAIN_MAP)
    .sort((a, b) => b[0].split(/\s+/).length - a[0].split(/\s+/).length); // longer keys first
  for (const [k, v] of entries) {
    const kTokens = k.split(/[\s\-_.]+/).filter(Boolean);
    if (kTokens.length > 0 && kTokens.every(t => keyTokens.has(t))) return v;
  }

  // 3. Generic fallback — let the Clearbit/Google chain handle it
  return `${key.replace(/[\s\-_.]+/g, '')}.com`;
}

// ─── Deterministic accent colour ─────────────────────────────────────────────
function getInitialColor(name) {
  const COLORS = ['#7c6cf2','#6366f1','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#fb923c'];
  let h = 0;
  for (const c of (name || '')) h = c.charCodeAt(0) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

// ─── Module-level cache so we never call IPC twice for the same app ───────────
const _nativeIconCache = new Map(); // appName → dataUrl | null

/**
 * AppIcon — resolves the correct icon for any app with a 4-stage fallback:
 *
 *   1. Native OS icon  (Electron IPC → app.getFileIcon on the installed .app / .exe)
 *   2. Clearbit Logo   (high-quality company logos; proper 404 triggers next stage)
 *   3. Google S2       (broad favicon coverage for websites)
 *   4. Coloured initial avatar (always available)
 *
 * Web apps (those with a `url` prop) skip the native lookup and start at stage 2.
 *
 * Props:
 *   appName   {string}   Display name of the app / process
 *   url       {string?}  Optional URL (used to resolve the domain for web apps)
 *   size      {number}   Icon container size in px  (default 24)
 *   radius    {number}   Border radius in px         (default 6)
 *   className {string}   Extra Tailwind classes for the wrapper div
 */
export default function AppIcon({ appName, url, size = 24, radius = 6, className = '' }) {
  const name    = appName || 'Unknown';
  const isWeb   = !!url;
  const domain  = resolveDomain(name, url);
  const color   = getInitialColor(name);
  const initial = name.trim().slice(0, 1).toUpperCase();

  // Stages: 'native' | 'clearbit' | 'google' | 'error'
  const [stage, setStage]           = useState(isWeb ? 'clearbit' : 'native');
  const [nativeDataUrl, setNative]  = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setNative(null);
    setStage(isWeb ? 'clearbit' : 'native');
  }, [name, isWeb, url]);

  // ── Fetch native icon via Electron IPC (local apps only) ──────────────────
  useEffect(() => {
    if (isWeb) return;                                    // web apps → skip

    // Already cached?
    if (_nativeIconCache.has(name)) {
      const cached = _nativeIconCache.get(name);
      if (cached) { setNative(cached); setStage('native'); }
      else         { setStage('clearbit'); }
      return;
    }

    const api = window.electron;
    if (!api?.getAppIcon) { setStage('clearbit'); return; } // Electron bridge missing

    api.getAppIcon({ appName: name })
      .then(dataUrl => {
        if (!mountedRef.current) return;
        _nativeIconCache.set(name, dataUrl || null);
        if (dataUrl) { setNative(dataUrl); setStage('native'); }
        else          { setStage('clearbit'); }
      })
      .catch(() => {
        if (!mountedRef.current) return;
        _nativeIconCache.set(name, null);
        setStage('clearbit');
      });
  }, [name, isWeb]);

  // ── Image error → advance to next stage ──────────────────────────────────
  const handleError = () => {
    if (stage === 'clearbit') setStage('google');
    else setStage('error');
  };

  // ── Determine current src ─────────────────────────────────────────────────
  let src = null;
  if (stage === 'native')   src = nativeDataUrl;
  if (stage === 'clearbit') src = `https://logo.clearbit.com/${domain}?size=64`;
  if (stage === 'google')   src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  // ── Render ────────────────────────────────────────────────────────────────
  const containerStyle = {
    width:          size,
    height:         size,
    borderRadius:   radius,
    flexShrink:     0,
    overflow:       'hidden',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     stage === 'error' ? color + '22' : 'transparent',
    border:         `1px solid ${color}25`,
  };

  return (
    <div style={containerStyle} className={className}>
      {/* Loading placeholder — very brief, shown while IPC is in-flight */}
      {stage === 'native' && !nativeDataUrl && (
        <div style={{
          width: size - 6, height: size - 6,
          borderRadius: radius - 2,
          background: color + '33',
        }}/>
      )}

      {/* Image stages */}
      {src && (
        <img
          key={stage}           /* remount so onError fires fresh each stage */
          src={src}
          alt={name}
          width={size - 4}
          height={size - 4}
          style={{ borderRadius: radius - 2, objectFit: 'contain' }}
          onError={handleError}
          draggable={false}
        />
      )}

      {/* Coloured initial fallback */}
      {stage === 'error' && (
        <span style={{
          fontSize:   Math.max(8, Math.round(size * 0.44)),
          fontWeight: 700,
          color,
          lineHeight: 1,
          userSelect: 'none',
        }}>
          {initial}
        </span>
      )}
    </div>
  );
}
