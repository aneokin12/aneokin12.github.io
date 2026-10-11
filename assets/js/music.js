// The record player's music. Two ways of playing the same playlist:
//
//   embed     Spotify's own embedded player. Works for everyone with no sign-in; visitors who are
//             not logged in to Spotify hear previews. Nothing is loaded from Spotify until it is opened.
//   account   After "Sign in with Spotify" (authorisation code with PKCE, so there is no secret in
//             this site), a Premium account plays full tracks in the page through Spotify's Web
//             Playback SDK, and the Web API supplies the profile and the live track list.
//
// Either way the page gets one stream of `onChange(state)` calls and one set of controls
// (toggle, next, prev, playIndex), so the turntable and the small player do not care which is in use.

const AUTH = 'https://accounts.spotify.com', API = 'https://api.spotify.com/v1';
const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
const STORE = 'kitroom-spotify', PENDING = 'kitroom-spotify-pending', TRACKS = 'kitroom-spotify-tracks';

const load = src => new Promise((ok, fail) => { const s = Object.assign(document.createElement('script'), { src, async: true }); s.onload = ok; s.onerror = () => fail(new Error('Could not load ' + src)); document.head.append(s); });
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

export function createMusic({ clientId, list, host, embedHeight = 352, onChange, toast }) {
  const redirect = location.origin + location.pathname.replace(/index\.html$/, '');      // the address registered with Spotify: the page itself
  const state = { engine: null, loading: false, playing: false, index: -1, title: list.name, artist: '', art: list.cover, position: 0, duration: 0, tracks: list.tracks, user: null, connecting: false, canSignIn: !!clientId, returned: false };
  const startAt = Math.floor(Math.random() * list.tracks.length);   // a different record each visit, not always track one
  let stamp = 0;                                    // when position was last reported, to run the progress line between reports
  const emit = () => { stamp = performance.now(); onChange(state); };
  const setTrack = (i, extra = {}) => { const t = state.tracks[i]; state.index = i; if (t) Object.assign(state, { title: t.title, artist: t.artist, art: t.art || art[t.uri] || list.cover, duration: t.ms }, extra); if (t && !t.art && !art[t.uri]) cover(t.uri); };

  // Cover art for a track, from Spotify's public oEmbed lookup (the embed does not report it).
  const art = {};
  function cover(uri) {
    art[uri] = '';
    fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(uri)).then(r => r.json()).then(d => { art[uri] = d.thumbnail_url || ''; if (state.tracks[state.index]?.uri === uri && art[uri]) { state.art = art[uri]; emit(); } }).catch(() => {});
  }

  // ------------------------------------------------------------------ embed
  let ctl = null, embedAsked = null, wantPlay = false, solo = false, advancing = false, begun = false;   // begun: something has been played this visit
  function embed() {
    return embedAsked ||= new Promise((ok, fail) => {
      state.loading = true; emit();
      window.onSpotifyIframeApiReady = api => api.createController(host, { uri: list.uri, width: '100%', height: embedHeight }, c => {
        ctl = c; state.loading = false; if (!state.engine) state.engine = 'embed';
        c.addListener('ready', () => { if (wantPlay && state.engine === 'embed') { wantPlay = false; c.play(); } });
        c.addListener('playback_update', e => {
          if (state.engine !== 'embed') return;
          const d = e.data, i = d.playingURI ? state.tracks.findIndex(t => t.uri === d.playingURI) : -1;
          if (!d.isPaused) begun = true;
          if (!begun) return;                          // the embed reports its first track before anything is played; ignore that
          if (i >= 0 && i !== state.index) setTrack(i);
          else if (state.index < 0) setTrack(0);
          Object.assign(state, { playing: !d.isPaused && !d.isBuffering, position: d.position || 0, duration: d.duration || state.duration });
          // A track loaded on its own has no playlist behind it, so carry on to the next one when it ends.
          if (solo && !advancing && d.isPaused && d.duration && d.position >= d.duration - 800) { advancing = true; setTimeout(() => { advancing = false; embedGo(state.index + 1); }, 300); }
          emit();
        });
        emit(); ok(c);
      });
      load('https://open.spotify.com/embed/iframe-api/v1').catch(err => { embedAsked = null; state.loading = false; emit(); fail(err); });
    });
  }
  function embedGo(i) {
    const n = state.tracks.length; i = ((i % n) + n) % n;
    begun = true; setTrack(i, { position: 0, playing: false }); emit();
    return embed().then(c => { solo = true; wantPlay = true; c.loadUri(state.tracks[i].uri); setTimeout(() => { if (wantPlay) { wantPlay = false; c.play(); } }, 900); });
  }

  // ------------------------------------------------------------------ sign-in (PKCE)
  let tokens = store.get(STORE);
  if (tokens?.user) state.user = tokens.user;        // show who is signed in straight away; Spotify confirms it a moment later
  // Another tab signed in, out, or renewed the token: follow it, so two tabs never fight over one refresh token.
  addEventListener('storage', e => {
    if (e.key !== STORE) return;
    const had = !!tokens; tokens = store.get(STORE);
    if (!tokens && had) signOut(true); else if (tokens && !had) account();
  });
  async function signIn() {
    // Spotify only accepts the loopback address by number, and each address keeps its own sign-in. Move over first.
    if (location.hostname === 'localhost') { location.href = location.href.replace('//localhost', '//127.0.0.1').replace(/#.*$/, '') + (location.search ? '&' : '?') + 'signin=1' + location.hash; return; }
    if (!clientId) return toast('Spotify sign-in is not set up yet: this site has no Spotify client ID.', true);
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48))), nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    store.set(PENDING, { verifier, nonce, hash: location.hash });
    location.href = `${AUTH}/authorize?` + new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirect, code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state: nonce });
  }
  async function grant(body) {
    const res = await fetch(`${AUTH}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, ...body }) });
    if (!res.ok) throw Object.assign(new Error('token ' + res.status), { status: res.status, denied: res.status === 400 || res.status === 401 });
    const d = await res.json();
    tokens = { access: d.access_token, refresh: d.refresh_token || tokens?.refresh, exp: Date.now() + (d.expires_in - 60) * 1000, user: tokens?.user };
    store.set(STORE, tokens);
    return tokens.access;
  }
  let refreshing = null;
  async function token() {
    if (!tokens) throw new Error('signed out');
    if (Date.now() < tokens.exp) return tokens.access;
    return refreshing ||= renew().finally(() => { refreshing = null; });
  }
  // Spotify hands out a new refresh token each time and retires the old one, so always start from what is stored:
  // another tab may have renewed already.
  async function renew() {
    const saved = store.get(STORE);
    if (saved && saved.refresh !== tokens.refresh) { tokens = saved; if (Date.now() < tokens.exp) return tokens.access; }
    try { return await grant({ grant_type: 'refresh_token', refresh_token: tokens.refresh }); }
    catch (err) {
      const now = store.get(STORE);                  // lost a race with another tab: use its result
      if (now && now.refresh !== tokens.refresh) { tokens = now; return tokens.access; }
      throw err;
    }
  }
  async function api(path, opts = {}) {
    const call = async () => fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + await token(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    let res = await call();
    if (res.status === 401 && tokens) { tokens.exp = 0; res = await call(); }      // the token was retired early: renew once and try again
    if (!res.ok) throw Object.assign(new Error(`${path} ${res.status}`), { status: res.status });
    return res.status === 204 || res.headers.get('content-length') === '0' ? null : res.json().catch(() => null);
  }
  function signOut(quiet) {
    tokens = null; store.set(STORE, null); store.set(TRACKS, null);
    clearTimeout(sdkTimer); clearTimeout(retry); retry = 0;
    player?.disconnect(); player = null; device = null;
    const was = state.engine === 'account';
    const go = quiet ? queued : null; queued = null;       // signed out behind the visitor's back: what they asked for still plays, as previews
    Object.assign(state, { user: null, connecting: false, tracks: list.tracks }, was ? { engine: ctl ? 'embed' : null, playing: false, index: -1, title: list.name, artist: '', art: list.cover, position: 0 } : {});
    emit();
    if (go !== null) embedGo(go);
    if (!quiet) toast('Signed out of Spotify here.');
  }
  // The playlist as the signed-in account sees it. Spotify has used two shapes for this over time, so accept both.
  // Kept for a day, so opening the kit room does not ask Spotify for the whole list every time.
  async function fetchTracks() {
    const kept = store.get(TRACKS);
    if (kept?.at > Date.now() - 864e5 && kept.tracks?.length) return kept.tracks;
    const id = list.uri.split(':').pop(), out = [];
    for (const kind of ['items', 'tracks']) {
      try {
        let path = `/playlists/${id}/${kind}?limit=100`;
        while (path && out.length < 400) {
          const page = await api(path);
          for (const row of page.items || []) { const t = row.item || row.track; if (t?.uri?.startsWith('spotify:track:')) out.push({ uri: t.uri, title: t.name, artist: (t.artists || []).map(a => a.name).join(', '), ms: t.duration_ms, art: t.album?.images?.at(-2)?.url || t.album?.images?.[0]?.url || '' }); }
          path = page.next ? page.next.replace(API, '') : null;
        }
        if (out.length) { store.set(TRACKS, { at: Date.now(), tracks: out }); return out; }
      } catch {}
    }
    return null;
  }
  const useTracks = t => { if (t && tokens) { const uri = state.tracks[state.index]?.uri; state.tracks = t; state.index = uri ? t.findIndex(x => x.uri === uri) : -1; emit(); } };
  // While the account is connecting, anything pressed is remembered and played once it is ready. If the
  // account turns out not to be usable, the same request goes to the embedded player instead.
  let queued = null;
  function release() {
    const go = queued; queued = null; state.connecting = false; emit();
    if (go !== null) embedGo(go);
  }
  let retry = 0, checking = false;
  async function account() {
    if (checking) return;
    checking = true;
    try {
      const me = await api('/me');
      if (!tokens) return;
      state.user = { name: me.display_name || me.id, premium: me.product === 'premium' };
      tokens.user = state.user; store.set(STORE, tokens);
      emit();
      fetchTracks().then(useTracks);
      if (state.user.premium) startSdk(); else { stopSdk(); release(); }
    } catch (err) {
      // Only a refusal from Spotify ends the sign-in. A dropped connection or a busy server leaves it alone.
      const refused = err.denied || err.status === 401 || err.status === 403 || err.message === 'signed out';
      if (!refused) { if (!player && !sdkLoading) release(); if (!retry) retry = setTimeout(() => { retry = 0; if (tokens) account(); }, 8000); return; }
      signOut(true);
      toast(err.status === 403 ? 'Spotify refused this account. While the app is in development mode, only accounts its owner has added can sign in.' : 'Spotify sign-in did not complete. Try again.', true);
    } finally { checking = false; }
  }

  // ------------------------------------------------------------------ account playback (Premium)
  // Spotify's in-page player takes a few seconds to appear as a device on the account. Until it does, the
  // page says "connecting" rather than falling back to previews; it retries once, then gives up out loud.
  let player = null, device = null, started = false, sdkLoading = false, sdkTimer = 0, sdkTries = 0, authRetried = false;
  async function startSdk() {
    if (player || sdkLoading) return;
    sdkLoading = true; state.connecting = true; emit();
    try {
      await new Promise((ok, fail) => { if (window.Spotify?.Player) return ok(); window.onSpotifyWebPlaybackSDKReady = ok; load('https://sdk.scdn.co/spotify-player.js').catch(fail); });
    } catch { sdkLoading = false; return giveUp('Spotify\'s player did not load, so its standard player is in use.'); }
    sdkLoading = false;
    if (!tokens) return;
    sdkTries = 0; connect();
  }
  const watch = () => { clearTimeout(sdkTimer); sdkTimer = setTimeout(() => { if (device) return; ++sdkTries < 2 ? connect() : giveUp('Spotify did not connect to your account in this page, so its standard player is in use. Reload to try again.'); }, 9000); };
  function stopSdk() { clearTimeout(sdkTimer); player?.disconnect(); player = null; device = null; }
  function giveUp(why) {
    stopSdk();
    if (state.engine === 'account') { state.engine = ctl ? 'embed' : null; state.playing = false; }
    release(); toast(why, true);
  }
  function connect() {
    stopSdk();
    const p = player = new window.Spotify.Player({ name: 'Neo Sud · kit room', getOAuthToken: cb => token().then(cb).catch(() => {}), volume: .7 });
    const mine = fn => (...a) => { if (p === player) fn(...a); };        // ignore a player that has been replaced
    p.addListener('ready', mine(({ device_id }) => {
      clearTimeout(sdkTimer); sdkTries = 0; authRetried = false;
      device = device_id; started = false;
      const carryOn = state.playing && state.engine === 'embed';       // the embed was already playing: keep the music going on the account
      ctl?.pause();
      Object.assign(state, { engine: 'account', connecting: false, playing: false, position: 0 }); if (state.index < 0) setTrack(startAt % state.tracks.length);
      emit();
      const go = queued ?? (carryOn ? state.index : null); queued = null;
      if (go !== null) accountPlay(go);
    }));
    p.addListener('not_ready', mine(() => { device = null; state.connecting = true; state.playing = false; emit(); watch(); }));   // dropped off: it usually comes back by itself
    p.addListener('player_state_changed', mine(s => {
      if (!s || state.engine !== 'account') return;
      const t = s.track_window?.current_track, i = t ? state.tracks.findIndex(x => x.uri === t.uri || x.uri === t.linked_from?.uri) : -1;
      Object.assign(state, { playing: !s.paused, position: s.position, duration: s.duration, index: i >= 0 ? i : state.index });
      if (t) Object.assign(state, { title: t.name, artist: (t.artists || []).map(a => a.name).join(', '), art: t.album?.images?.[0]?.url || state.art });
      emit();
    }));
    p.addListener('initialization_error', mine(() => giveUp('This browser cannot play Spotify in the page, so its standard player is in use.')));
    p.addListener('account_error', mine(() => giveUp('Playing full tracks here needs Spotify Premium. Its standard player still works.')));
    p.addListener('authentication_error', mine(() => {
      if (!authRetried && tokens) { authRetried = true; tokens.exp = 0; return connect(); }      // a stale token: renew it and try once more
      signOut(true); toast('Spotify sign-in has expired. Sign in again.', true);
    }));
    p.addListener('autoplay_failed', mine(() => { started = false; state.playing = false; emit(); }));   // the browser wants a click first
    p.addListener('playback_error', mine(({ message }) => toast('Spotify could not play that: ' + message, true)));
    p.connect().then(ok => { if (!ok && p === player) giveUp('Spotify did not connect to your account in this page, so its standard player is in use.'); });
    watch();
  }
  async function accountPlay(i, tries = 4) {
    const dev = device;
    player.activateElement?.();                      // lets phones start audio from this press
    started = true; setTrack(i, { position: 0 }); emit();
    try { await api(`/me/player/play?device_id=${dev}`, { method: 'PUT', body: JSON.stringify({ context_uri: list.uri, offset: { uri: state.tracks[i].uri } }) }); }
    catch (err) {
      // Straight after connecting, Spotify sometimes does not know the new device yet. Give it a moment.
      if ([404, 502, 503].includes(err.status) && tries > 1 && dev && dev === device) { await new Promise(r => setTimeout(r, 800)); return dev === device ? accountPlay(i, tries - 1) : undefined; }
      started = false; toast(err.status === 403 ? 'Spotify would not start playback on this account.' : 'Could not reach Spotify to start playing.', true);
    }
  }
  const viaAccount = () => state.engine === 'account' && player && device;
  const queue = i => { const n = state.tracks.length; queued = ((i % n) + n) % n; setTrack(queued, { position: 0, playing: false }); emit(); };

  // ------------------------------------------------------------------ start-up
  (async () => {
    const q = new URLSearchParams(location.search), pending = store.get(PENDING);
    if ((q.has('code') || q.has('error')) && pending) {
      store.set(PENDING, null); state.returned = true;
      history.replaceState(null, '', location.pathname + (pending.hash || ''));
      if (q.get('state') !== pending.nonce || q.has('error')) { toast(q.get('error') === 'access_denied' ? 'Spotify sign-in was cancelled.' : 'Spotify sign-in did not complete. Try again.', true); emit(); return; }
      state.connecting = true; emit();
      try { await grant({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirect, code_verifier: pending.verifier }); }
      catch { release(); toast('Spotify sign-in did not complete. Try again.', true); return; }
    }
    if (q.has('signin')) { history.replaceState(null, '', location.pathname + location.hash); if (!tokens) return signIn(); }
    if (!tokens || !clientId) return;
    // Already signed in: the saved profile says whether this is a Premium account, so its player can start
    // connecting at once while Spotify confirms the account in the background.
    const known = tokens.user;
    if (!known || known.premium) { state.connecting = true; emit(); }
    if (known?.premium) { startSdk(); const kept = store.get(TRACKS); if (kept?.tracks?.length) useTracks(kept.tracks); }
    account();
  })();
  // Keep the progress line moving between Spotify's reports.
  setInterval(() => { if (state.playing && state.duration) { const now = performance.now(); state.position = Math.min(state.duration, state.position + (now - stamp)); stamp = now; onChange(state, true); } }, 500);

  const from = () => (state.index < 0 ? startAt : state.index);
  return {
    state, signIn, signOut: () => signOut(false),
    // Make sure there is something to play with; called when the record player is opened.
    open() { if (!viaAccount() && !state.connecting) embed().catch(() => toast('Spotify did not load. Check the connection and try again.', true)); },
    // Start (or carry on) playing; unlike toggle, never pauses.
    play() {
      if (viaAccount()) { player.activateElement?.(); return started ? player.resume() : accountPlay(from()); }
      if (state.connecting) return queue(from());
      (!begun ? embedGo(startAt) : embed().then(c => c.play())).catch(() => {});
    },
    toggle() {
      if (viaAccount()) { player.activateElement?.(); return started ? player.togglePlay() : accountPlay(from()); }
      if (state.connecting) return queued === null ? queue(from()) : (queued = null, emit());
      (!begun ? embedGo(startAt) : embed().then(c => c.togglePlay())).catch(() => toast('Spotify did not load. Check the connection and try again.', true));
    },
    next() { viaAccount() ? (started ? player.nextTrack() : accountPlay((from() + 1) % state.tracks.length)) : state.connecting ? queue(from() + 1) : embedGo(!begun ? startAt : state.index + 1); },
    prev() { viaAccount() ? (started ? player.previousTrack() : accountPlay(Math.max(0, from() - 1))) : state.connecting ? queue(from() - 1) : embedGo(!begun ? startAt : Math.max(0, state.index - 1)); },
    playIndex(i) { viaAccount() ? accountPlay(i) : state.connecting ? queue(i) : embedGo(i); },
  };
}
