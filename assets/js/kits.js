// Shared by both rooms: who is in the squad, what their kits look like, and how a kit is drawn.
// The stadium wraps a kit around a player; the kit room hangs the same kit on the wall.
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// One player per stop in the career, in shirt-number order, which is also the order the ball travels.
// `call` is the commentary on the freeze frame; `live` is the line while the ball is on its way to them.
// kit.c is [base colour, pattern colour, print colour]; kit.tint recolours the sponsor logo to one ink; kit.logoScale sizes it.
export const squad = [
  { id: 'about', plaque: 'HOME', n: 1, pos: 'GK', spell: 'About', title: 'Neo Sud', role: 'Software engineer', meta: 'Bay Area, California', photo: '/assets/me/headshot.webp', alt: 'Neo smiling, in a grey shirt', focus: '50% 22%', keep: true,
    collage: [['/assets/me/maestro.webp', 'a maestro in the making', 'Neo as a boy in a white and black kit, running onto a green and white ball', 900, 708], ['/assets/me/prodigy.webp', 'early signs of a prodigy', 'Neo as a small child in a red jumper, about to kick a ball on a grassy hill', 810, 900],
      ['/assets/me/vision.webp', 'hawk-like vision', 'Neo as a child in a maroon shirt at training, a ball at his feet, looking across the pitch', 900, 792], ['/assets/me/strike.webp', 'a pure strike of the ball', 'Neo in a white kit, leg drawn back to strike a ball', 900, 750]],
    lede: 'I work on AI evaluation, developer tools, and infrastructure for machine learning. I like the place where AI, infrastructure, and immersive interfaces meet.',
    kit: { c: ['#f2c230', '#b07c08', '#15120a'], pattern: 'zigzag', front: 'Neo Sud', shorts: '#15120a', socks: '#f2c230', long: true, gloves: '#f1f3f6', edge: 'rgb(255 255 255 / .45)' },
    call: 'Sud, with it in his hands, and he is in no hurry. Part-time engineer, full-time football aficionado. Every attack starts with him, and he would much rather build something than hoof it long.',
    links: [['Email me', 'mailto:neo.sud@gmail.com'], ['Résumé', '/assets/resume.pdf'], ['GitHub', 'https://github.com/aneokin12'], ['LinkedIn', 'https://linkedin.com/in/neosud']] },
  { id: 'ucsc', plaque: 'ACADEMY · 2023–26', n: 2, pos: 'LB', spell: 'Academy', title: 'UC Santa Cruz', role: 'B.S. Computer Science', meta: 'Sep 2023 – Mar 2026 · Santa Cruz, CA', crest: '/assets/logos/ucsc-slugs.png',
    kit: { c: ['#0c3f78', '#f5c518', '#ffffff'], pattern: 'pins', front: 'UC Santa Cruz', logoScale: .8, shorts: '#0a2f5c', socks: '#f5c518' },
    live: 'Sud slings it out to the left…',
    call: 'Lovely control by the academy graduate. Came all the way through the system at Santa Cruz, and he is not giving the ball away now.',
    stats: [['3.96', 'GPA'], ['2.5', 'years']],
    pts: ['Cumulative GPA of 3.96 out of 4.0.', 'Coursework in applied machine learning, artificial intelligence, computer architecture, systems design, databases, algorithms, and programming languages.'],
    links: [['ucsc.edu', 'https://www.ucsc.edu']] },
  { id: 'tech4good', plaque: 'LOAN · 2024–25', n: 3, pos: 'CB', spell: 'Loan spell', title: 'Tech4Good Lab', role: 'Software Engineering Intern, NSF REU', meta: 'Apr 2024 – Sep 2025 · Santa Cruz, CA', crest: '/assets/logos/tech4good.svg',
    kit: { c: ['#f3f8fd', '#9fd0f2', '#17324d'], pattern: 'stripes', front: 'Tech4Good Lab', shorts: '#17324d', socks: '#f3f8fd', edge: 'rgb(255 255 255 / .7)' },
    live: 'The full-back steps up and plays it inside…',
    call: 'Stopped dead. No nonsense from this one: at his first loan, he learned to step in early and be the anchor for his team. Head up, and out it goes.',
    stats: [['200+', 'users'], ['50+', 'datasets'], ['2', 'papers']],
    pts: ['Architected an ML platform used by 200+ people.', 'Engineered a RAG service over 50+ expert datasets to improve automated response accuracy.', 'First-authored research for CHI ’26 and IUI ’26.', 'Awarded a $6,000 NSF REU for HCI research under Professor David Lee.'],
    tags: 'RAG · ML platform · HCI', links: [['tech4good.soe.ucsc.edu', 'https://tech4good.soe.ucsc.edu']] },
  { id: 'genomics', plaque: 'LOAN · 2025–26', n: 4, pos: 'RB', spell: 'Loan spell', title: 'UCSC Genomics Institute', role: 'Software Engineering Intern', meta: 'Mar 2025 – Jan 2026 · Santa Cruz, CA', crest: '/assets/logos/genomics.svg',
    kit: { c: ['#2a6fdb', '#a9cbff', '#ffffff'], pattern: 'helix', front: 'Genomics', tint: '#ffffff', shorts: '#f4f7fc', socks: '#2a6fdb' },
    live: 'No nonsense from the centre-half. Out to the right…',
    call: 'First touch out of his feet and he is gone down the right. What an engine on this lad. You just have to stop and admire the tenacity and work rate. Away he goes…',
    stats: [['63M', 'embeddings'], ['91%', 'accuracy'], ['25+', 'datasets']],
    pts: ['Architected AWS S3 pipelines for 25+ datasets, extracting 63M+ embeddings.', 'Scaled KNN and Louvain clustering to 91% accuracy for a high-resolution tumor cell atlas.', 'One of 27 national groups selected to present at the NCI ITCR 2025 Symposium.'],
    tags: 'AWS S3 · KNN · Louvain clustering', links: [['genomics.ucsc.edu', 'https://genomics.ucsc.edu']] },
  { id: 'crowdstrike', plaque: 'LOAN · 2025', n: 5, pos: 'CM', spell: 'Loan spell', title: 'CrowdStrike', role: 'Software Engineering Intern, ML infrastructure', meta: 'Jun – Sep 2025 · Sunnyvale, CA', crest: '/assets/logos/crowdstrike.svg',
    kit: { c: ['#e3122e', '#16090b', '#ffffff'], pattern: 'slash', front: 'CrowdStrike', tint: '#ffffff', shorts: '#16090b', socks: '#e3122e' },
    live: 'Driven forward into midfield…',
    call: 'This is the one who keeps the whole side ticking. You can see the influence of the vets he played with at his last side. Tidy, quick, nothing wasted, and good luck getting the ball off him.',
    stats: [['30+', 'classifiers'], ['4×', 'CI speed'], ['-40%', 'bug tickets']],
    pts: ['Built a unified CLI for 30+ malware classifiers, used for internal model testing and deployment.', 'Moved microservices into a monorepo, cutting bug tickets by 40%.', 'Automated Python (UV) pipelines for reproducible builds across cloud environments.', 'Tuned Jenkins CI/CD for up to 4× faster builds and runtime.'],
    tags: 'Python · UV · Jenkins · monorepo', links: [['crowdstrike.com', 'https://www.crowdstrike.com']] },
  { id: 'boost', plaque: 'LOAN · 2026', n: 6, pos: 'LF', spell: 'Loan spell', title: 'Boost Results', role: 'AI Engineering Intern', meta: 'Mar – Jun 2026 · San Mateo, CA', crest: '/assets/logos/boost-mark.svg',
    kit: { c: ['#19b4e6', '#0a4a78', '#ffffff'], fade: '#0d74b3', pattern: 'chevrons', front: 'Boost', logoScale: .8, tint: '#ffffff', shorts: '#0a4a78', socks: '#f4f7fc' },
    live: 'Clipped out to the left, inside of the foot…',
    call: 'Oh, get out! A rabona stall smooth as whipped butter. He’s answering questions defenders don’t even know to ask yet. The crowd are up. They know what is coming.',
    stats: [['3k', 'tickets'], ['45%', 'fixed early'], ['3', 'pipelines']],
    pts: ['Extracted root causes for 3k Jira tickets across Azure telemetry with a PHI-safe LLM agent.', 'Secured database querying across 3 MCP pipelines by converting user dates and names into safe KQL and SQL.', 'Resolved 45% of bugs upfront with an agent MVP using a heuristic pre-filter and PHI sanitizer.'],
    tags: 'LLM agents · MCP · KQL · SQL · Azure', links: [['boostresults.com', 'https://boostresults.com']] },
  { id: 'illumio', plaque: 'LOAN · 2026', n: 7, pos: 'RF', spell: 'Loan spell', title: 'Illumio', role: 'Software Engineering Intern', meta: 'Jun – Sep 2026 · Sunnyvale, CA', crest: '/assets/logos/illumio-mark.svg',
    kit: { c: ['#ff8a2a', '#7a2f05', '#1d0d00'], pattern: 'grid', front: 'Illumio', logoScale: .8, tint: '#1d0d00', shorts: '#1d0d00', socks: '#ff8a2a', edge: 'rgb(255 255 255 / .4)' },
    live: 'A rabona! All the way across…',
    call: 'Out of the night sky and onto his laces, as if it were on a string. The number seven, the last of the loans and the sharpest of the lot. He knows which ones to leave and which ones to hit, and this one he leaves: head up, and he has seen the striker’s run.',
    stats: [['45', 'tickets/wk'], ['$500', 'saved/mo'], ['3', 'SEV2s']],
    pts: ['Cut 45 tickets a week from manual triage with an automated Slack and Jira triage agent.', 'Reduced AI costs by $500 a month with an LLM-as-a-judge eval engine for benchmarking accuracy.', 'Resolved 3 SEV2 customer escalations by correcting VEN build and install OS compatibility logic.', 'Replaced hardcoded OS IDs with dynamic check-env scripts driven by a compatibility matrix.'],
    tags: 'LLM evals · Slack · Jira · agents', links: [['illumio.com', 'https://www.illumio.com']] },
  { id: 'echostar', plaque: 'SIGNED · 2026', n: 8, pos: 'ST', spell: 'Permanent transfer', title: 'EchoStar', role: 'Agentic AI Engineer II', meta: 'Full time · from Oct 2026', crest: '/assets/logos/echostar.svg',
    kit: { c: ['#f6f7f9', '#e31b22', '#c8161d'], pattern: 'echo', front: 'EchoStar', logoScale: .85, shorts: '#1c0b0d', socks: '#f6f7f9', edge: 'rgb(255 255 255 / .75)' },
    live: 'Dinked back across the box, and the striker has peeled away…',
    call: 'Takes it on the chest, and it sits up for him. Nobody is near him. After a series of loans, this is the biggest permanent transfer of his career. Will he prove his worth…?',
    pts: ['Associate-level engineering role, and the first permanent contract after the loan spells.', 'Builds AI agents with agentic frameworks such as LangGraph and CrewAI.'],
    tags: 'AI agents · LangGraph · CrewAI', links: [['echostar.com', 'https://www.echostar.com']] },
];
export const fullTime = {
  pos: 'FT', spell: 'Full time', title: 'Eight touches, one career', role: 'What he does away from the club', n: '★', kit: { c: ['#ffd23f', '#b98a12', '#1b1500'] },
  live: 'On the volley…',
  call: 'SUD! Top corner! The keeper has not moved! Eight shirts, eight touches, from his own hands to the back of the net, and three of them are away to the corner flag on their knees. And wait until you see what he gets up to on his days off.',
  honours: [['Vouch', 'Send environment variables peer to peer. Go, SPAKE2 handshakes, AES in transit.'], ['NMAP History', 'Orchestrates NMAP scans and diffs what changed between them. Go, MySQL.'], ['SudGPT', 'A personal AI chatbot.']],
  links: [['Email me', 'mailto:neo.sud@gmail.com'], ['Résumé', '/assets/resume.pdf'], ['GitHub', 'https://github.com/aneokin12'], ['SudGPT demo', 'https://sudgpt.vercel.app'], ['LinkedIn', 'https://linkedin.com/in/neosud']],
};

export const trophies = [
  { id: 'vouch', kind: 'trophy', cup: 'globe', spell: 'Trophy cabinet', plaque: 'VOUCH', num: '★', c: ['#f4d47c', '#b88a2f', '#2a1f05'],
    title: 'Vouch', role: 'Share environment variables, peer to peer', meta: 'Go · SPAKE2 · AES · GitHub Actions',
    pts: ['A peer-to-peer tool in Go for sending environment variables securely over a network.', 'SPAKE handshakes and AES encryption protect the secrets in transit.', 'Releases run through GitHub Actions with goreleaser and npm-publish.'],
    links: [['GitHub', 'https://github.com/aneokin12']] },
  { id: 'nmap-history', kind: 'trophy', cup: 'ears', spell: 'Trophy cabinet', plaque: 'NMAP HISTORY', num: '★', c: ['#f4d47c', '#b88a2f', '#2a1f05'],
    title: 'NMAP History', role: 'Scan networks and track what changed', meta: 'Go · JavaScript · MySQL',
    pts: ['A Go web app that orchestrates NMAP scans across network targets and keeps their history in MySQL.', 'A parallel execution engine with bounded goroutines handles concurrent scans safely.', 'State diffing shows which ports were added or removed between scans.'],
    links: [['GitHub', 'https://github.com/aneokin12']] },
  { id: 'sudgpt', kind: 'trophy', cup: 'crown', spell: 'Trophy cabinet', plaque: 'SUDGPT', num: '★', c: ['#f4d47c', '#b88a2f', '#2a1f05'],
    title: 'SudGPT', role: 'A personal AI chatbot', meta: 'sudgpt.vercel.app',
    links: [['Open the demo', 'https://sudgpt.vercel.app'], ['GitHub', 'https://github.com/aneokin12']] },
];

// Sponsor logos. SVGs often carry only a viewBox, which browsers rasterise at a default size and the
// wrong shape, so read the viewBox and give the image explicit dimensions. The result is a canvas with
// a transparent background; `tint` repaints every opaque pixel in one ink, the way a sponsor is printed.
export async function loadLogo(src, tint) {
  if (!src) return null;
  try {
    let url = src, ratio = 0;
    if (/\.svg$/i.test(src)) {
      const svg = new DOMParser().parseFromString(await (await fetch(src)).text(), 'image/svg+xml').documentElement;
      const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const w = vb[2] || parseFloat(svg.getAttribute('width')) || 100, h = vb[3] || parseFloat(svg.getAttribute('height')) || 100, k = 2048 / Math.max(w, h);
      svg.setAttribute('width', w * k); svg.setAttribute('height', h * k); ratio = w / h;
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    }
    const img = await new Promise((done, fail) => { const i = new Image(); i.onload = () => done(i); i.onerror = fail; i.src = url; });
    ratio ||= img.naturalWidth / img.naturalHeight;
    const c = document.createElement('canvas'); c.width = ratio >= 1 ? 2048 : 2048 * ratio; c.height = ratio >= 1 ? 2048 / ratio : 2048;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
    if (tint) { g.globalCompositeOperation = 'source-in'; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height); }
    // Trim any empty margin so every logo is sized by what is actually drawn.
    const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return null;
    const t = document.createElement('canvas'); t.width = x1 - x0 + 4; t.height = y1 - y0 + 4;
    t.getContext('2d').drawImage(c, x0 - 2, y0 - 2, t.width, t.height, 0, 0, t.width, t.height);
    return { img: t, ratio: t.width / t.height };
  } catch { return null; }
}

// The shirt is drawn as one strip that wraps the body: the front is centred at x = 512 and the
// back straddles the seam at x = 0 / 1024.
const PATTERN = {
  zigzag(g, w, h, c) {            // loud 90s keeper shirt
    g.strokeStyle = c[1]; g.lineWidth = 26; g.lineJoin = 'miter'; g.globalAlpha = .6;
    for (let y = -30; y < h + 60; y += 80) { g.beginPath(); for (let x = 0; x <= w; x += 64) g.lineTo(x, y + ((x / 64) % 2 ? 36 : 0)); g.stroke(); }
  },
  sash(g, w, h, c) {
    g.fillStyle = c[1];
    for (const cx of [0, 512, 1024]) { g.beginPath(); g.moveTo(cx - 235, 0); g.lineTo(cx - 125, 0); g.lineTo(cx + 235, h); g.lineTo(cx + 125, h); g.fill(); }
  },
  pins(g, w, h, c) { g.fillStyle = c[1]; g.globalAlpha = .6; for (let x = 16; x < w; x += 32) g.fillRect(x - 1.5, 0, 3, h); },
  echo(g, w, h, c) {              // signal rings spreading from the hip
    g.strokeStyle = c[1];
    for (const cx of [362 - w, 362, 362 + w]) for (let r = 70, n = 0; r < 700; r += 44, n++) { g.globalAlpha = n % 3 ? .16 : .34; g.lineWidth = n % 3 ? 5 : 11; g.beginPath(); g.arc(cx, h + 30, r, Math.PI, Math.PI * 2); g.stroke(); }
  },
  stripes(g, w, h, c) { g.fillStyle = c[1]; for (let x = 512 - 32 - 640; x < w; x += 128) g.fillRect(x, 0, 64, h); },
  helix(g, w, h, c) {             // double helix pinstripes
    g.lineWidth = 5; g.globalAlpha = .7;
    for (let cx = 64; cx < w; cx += 128) {
      for (const s of [1, -1]) { g.strokeStyle = c[1]; g.beginPath(); for (let y = 0; y <= h; y += 6) g.lineTo(cx + s * 22 * Math.sin(y / 34), y); g.stroke(); }
      g.lineWidth = 3; for (let y = 10; y < h; y += 26) { const dx = 22 * Math.sin(y / 34); g.beginPath(); g.moveTo(cx - dx, y); g.lineTo(cx + dx, y); g.stroke(); } g.lineWidth = 5;
    }
  },
  slash(g, w, h, c) {             // three claw marks, front and back
    g.fillStyle = c[1];
    for (const cx of [0, 512, 1024]) for (const k of [-1, 0, 1]) { const x = cx + k * 92; g.beginPath(); g.moveTo(x + 92, 20); g.lineTo(x + 138, 20); g.lineTo(x - 96, h - 20); g.fill(); }
  },
  chevrons(g, w, h, c) {          // arrows pointing up
    g.strokeStyle = c[1]; g.lineWidth = 24; g.lineJoin = 'miter';
    for (let y = h + 40, n = 0; y > -80; y -= 74, n++) { g.globalAlpha = clamp(.75 - n * .09, .08, 1); g.beginPath(); for (let cx = -256; cx <= w + 256; cx += 256) g.lineTo(cx, y + ((cx / 256) % 2 ? 0 : 92)); g.stroke(); }
  },
  grid(g, w, h, c) {              // segments
    g.strokeStyle = c[1];
    for (let x = 0; x <= w; x += 64) { g.globalAlpha = x % 128 ? .3 : .6; g.lineWidth = x % 128 ? 4 : 7; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 64) { g.globalAlpha = y % 128 ? .3 : .6; g.lineWidth = y % 128 ? 4 : 7; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  },
};

// Everything is drawn as vectors at `scale` times the nominal 1024 × 512, so print stays sharp close up.
export function drawKit(kit, crest, num, scale = 3) {
  const canvas = document.createElement('canvas'), w = 1024, h = 512, g = canvas.getContext('2d');
  canvas.width = w * scale; canvas.height = h * scale; g.scale(scale, scale); g.imageSmoothingQuality = 'high';
  {
    const [base, , ink] = kit.c;
    const body = g.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, base); body.addColorStop(1, kit.fade || base);
    g.fillStyle = body; g.fillRect(0, 0, w, h);
    g.save(); PATTERN[kit.pattern]?.(g, w, h, kit.c); g.restore();
    g.fillStyle = 'rgb(0 0 0 / .2)'; g.fillRect(256 - 13, 0, 26, h); g.fillRect(768 - 13, 0, 26, h);   // side panels
    g.fillStyle = ink; g.fillRect(0, 0, w, 18);                                                          // collar
    g.fillStyle = 'rgb(0 0 0 / .28)'; g.fillRect(0, h - 10, w, 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const put = (txt, x, y, font, max) => { g.font = font; g.strokeStyle = kit.edge || 'rgb(0 0 0 / .6)'; g.lineWidth = 9; g.strokeText(txt, x, y, max); g.fillStyle = ink; g.fillText(txt, x, y, max); };
    // Centre of the chest: the club's own logo as the shirt sponsor, straight onto the cloth.
    if (crest) { const lw = (crest.ratio > 2 ? 290 : crest.ratio > 1.3 ? 230 : 150) * (kit.logoScale || 1), lh = lw / crest.ratio; g.drawImage(crest.img, 512 - lw / 2, 292 - lh / 2, lw, lh); }
    else put(kit.front.toUpperCase(), 512, 285, '800 60px Anybody, sans-serif', 310);
    put(String(num), 512 - 100, 152, '900 62px Anybody, sans-serif');
    // Over the heart: an NS monogram on a shield
    const bx = 512 + 100, by = 150;
    g.beginPath(); g.moveTo(bx - 34, by - 38); g.lineTo(bx + 34, by - 38); g.lineTo(bx + 34, by + 8); g.quadraticCurveTo(bx + 34, by + 34, bx, by + 46); g.quadraticCurveTo(bx - 34, by + 34, bx - 34, by + 8); g.closePath();
    g.fillStyle = ink; g.fill(); g.strokeStyle = kit.c[1]; g.lineWidth = 5; g.stroke();
    g.fillStyle = base; g.font = '900 40px Anybody, sans-serif'; g.fillText('NS', bx, by, 54);
    for (const x of [0, w]) { put('SUD', x, 104, '800 64px Anybody, sans-serif', 280); put(String(num), x, 300, '900 250px Anybody, sans-serif', 300); }
  }
  return canvas;
}
