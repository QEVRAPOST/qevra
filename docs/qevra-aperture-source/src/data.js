/* ---------- content data: every product value here is an example and is labelled as one ---------- */
const DATA = {};

DATA.status = [
  ['exp', 'Experimental · testnet design preview'],
  ['exp', 'ML-DSA authorization: under evaluation'],
  ['unk', 'Independent audit: none yet'],
  ['unk', 'Swap router: not configured']
];

/* Scene keyframes. The landing scrubs between these as the reader moves from one frame to the next.
   Keys: explode scatter rev mis lit pq swarm tilt zoom fy (see scene.js). */
DATA.K = [
  /* 0 hero      */ { explode: .26, scatter: 0, rev: 1, mis: 0, lit: 1, pq: 1, swarm: 1, tilt: 0,   zoom: 1,    fy: .5 },
  /* 1 rings     */ { explode: 1,   scatter: 1, rev: 0, mis: 0, lit: 1, pq: 0, swarm: 0, tilt: .1,  zoom: 1,    fy: .5 },
  /* 2 lock      */ { explode: .62, scatter: 1, rev: 1, mis: 0, lit: 1, pq: 0, swarm: 0, tilt: .04, zoom: 1,    fy: .5 },
  /* 3 break     */ { explode: .62, scatter: 1, rev: 1, mis: 1, lit: 1, pq: 0, swarm: 0, tilt: .04, zoom: 1,    fy: .5 },
  /* 4 outline   */ { explode: .5,  scatter: 1, rev: 1, mis: 0, lit: 1, pq: 1, swarm: 0, tilt: .12, zoom: 1.55, fy: 1 },
  /* 5 swarm     */ { explode: .4,  scatter: 1, rev: 1, mis: 0, lit: 1, pq: 1, swarm: 1, tilt: .02, zoom: 1,    fy: .5 },
  /* 6 closing   */ { explode: .26, scatter: 1, rev: 1, mis: 0, lit: 1, pq: 1, swarm: 1, tilt: .02, zoom: 1,    fy: .5 }
];

DATA.caps = [
  'Eight rings, one per swap detail.',
  'Eight rings, one per detail. Each is turned away until you review it.',
  'Each ring turns to its reviewed value. Light passes when all eight match.',
  'The amount ring is out of line, so the light stops there.',
  'The dashed ring is post-quantum authorization, under evaluation.',
  'The Swarm ring is separate, with an air gap and a human review dock.',
  'The whole object. Nothing is drawn solid without evidence.'
];

DATA.try = [
  '<b>Every ring matches</b> what you reviewed, so light passes through all eight. This is a design preview of a comparison. It does not show that anything is secure.',
  '<b>The amount ring no longer matches.</b> The light stops at that ring, so you can see which detail changed. QEVRA is designed to ask for a fresh review.'
];

DATA.steps = [
  { t: 'Every detail gets a ring', p: 'A swap is a set of promises: who gets paid, on which chain, which tokens, how much, through which router, with what slippage limit, at which nonce, before which deadline. Each promise gets its own engraved ring.' },
  { t: 'Review it, and the rings turn into place', p: 'When you review a swap, each ring turns to the value you saw, starting at the top. When all eight match, a line of light can pass through the slots.', note: 'Design preview. The light shows a comparison. It is not a guarantee.' },
  { t: 'Change one detail and the line breaks', p: 'If the amount is not what you reviewed, that ring turns out of line and the light stops there. You can see which detail moved. QEVRA is designed to ask for a fresh review before anything is signed.' },
  { t: 'The experimental part is an outline', p: 'The ring on top stands for ML-DSA, a post-quantum signature scheme that QEVRA is evaluating for its smart account. It is dashed because it is under evaluation. Nothing is drawn solid until there is evidence.', note: 'ML-DSA is the initial candidate (NIST FIPS 204). QEVRA makes no claim that it resists quantum attacks.' },
  { id: 'swarm', t: 'The Security Swarm stays outside the gap', core: 'The Security Swarm researches, tests, and reports. It does not control your wallet.', p: 'Its ring sits apart from the stack, with an air gap between them. Its reports go to a human review dock, which stays unlit until a person records a review.', cta: ['See example runs', 'security'] },
  { id: 'start', t: 'Try the app preview', p: 'Connect a wallet, open a QEVRA account, then make one swap. The preview uses example data only, and nothing in it can move funds.', path: [
      ['outline', 'Connect wallet', 'Use the wallet you already have, an external account.'],
      ['outline', 'Open your QEVRA account', 'A separate smart account holds your QEVRA assets.'],
      ['dotted', 'Swap', 'One simple swap, reviewed before you sign. No route is set yet.']
    ] }
];

DATA.facts = [
  ['outline', 'Wallet', 'Connect the wallet you already use. QEVRA opens a separate smart account for its assets.'],
  ['dotted', 'Simple swap', 'One swap, with every detail reviewed before you sign. The router is not configured yet.'],
  ['outline', 'Post-quantum research', 'ML-DSA signatures are under evaluation, and an open Security Swarm researches and tests. Not audited.']
];

DATA.swarmCan = [
  'Read public papers, advisories, standards and repositories.',
  'Run tests in isolated sandboxes that hold no production secrets.',
  'Report what it found, with its sources, its limits and what it could not verify.',
  'Propose a fix as a patch on a development branch.'
];
DATA.swarmCannot = [
  'See or hold your private keys, post-quantum keys, seed phrases or signing sessions.',
  'Sign, swap, approve or transfer anything.',
  'Upgrade, pause, replace or deploy production contracts.',
  'Change signers, recovery rules, router allowlists or spending limits.',
  'Merge a fix. Tests, a human review and explicit approval come first.'
];

/* ---------- design system data ---------- */
DATA.colors = [
  ['Graphite', '--bg', '#0C0D0F', 'surface', 'Page ground'],
  ['Panel', '--bg-2', '#15171A', 'surface', 'Raised surface, panels, status bar'],
  ['Inset', '--bg-3', '#202328', 'surface', 'Selected rows, wells'],
  ['Line', '--line', '#2E3238', 'line', 'Hairlines between rows'],
  ['Line strong', '--line-2', '#454A52', 'line', 'Dividers inside controls, ghost buttons, chips'],
  ['Control line', '--line-ctl', '#6A6F77', 'line', 'Borders of inputs, selects and toggle groups (3.5:1 or more)'],
  ['Warm silver', '--fg', '#ECE8DF', 'text', 'Text, rings, primary button'],
  ['Mist', '--fg-2', '#B9B5AB', 'text', 'Secondary text'],
  ['Slate', '--muted', '#8B8F96', 'text', 'Tertiary text, data labels'],
  ['Tungsten', '--exp', '#E3A93B', 'text', 'Experimental, the Swarm, blocked'],
  ['Beam', '--focus', '#FFE9B8', 'text', 'The line of light, focus ring'],
  ['Lime', '--pass', '#C4F25A', 'text', 'Reserved for a test that passed'],
  ['Signal red', '--fail', '#E5604D', 'text', 'Failed or changed'],
  ['Steel', '--info', '#9FB7C9', 'text', 'Informational only, rare']
];

DATA.typeScale = [
  ['Display XL', 'Instrument Serif 400', 'clamp(44px, 5.6vw, 88px) / 0.94 · -0.015em', 'Landing H1 only', 'd-xl'],
  ['Display L', 'Instrument Serif 400', 'clamp(32px, 3.6vw, 52px) / 1.02 · -0.012em', 'Section headings, story steps', 'd-l'],
  ['Display M', 'Instrument Serif 400', '28px / 1.1 · -0.01em', 'Panel headings, the core sentence', 'd-m'],
  ['Display S', 'Instrument Serif 400', '22px / 1.15', 'Card headings', 'd-s'],
  ['Body L', 'Geist 400', '17px / 1.55', 'Hero lede, step text', 'b-l'],
  ['Body', 'Geist 400', '15px / 1.5', 'Default interface text', 'b'],
  ['Body S', 'Geist 400', '13.5px / 1.45', 'Table cells, helper text', 'b-s'],
  ['Label', 'Geist 500', '14px / 1.2', 'Buttons, tabs, field names', 'lab'],
  ['Data', 'Geist Mono 400', '12.5px / 1.45', 'Addresses, values, status text', 'mono'],
  ['Data S', 'Geist Mono 400', '11.5px / 1.35', 'Captions, footnotes, table heads', 'mono-s']
];

DATA.tokens = {
  space: [['--s-1', '4px'], ['--s-2', '8px'], ['--s-3', '12px'], ['--s-4', '16px'], ['--s-5', '20px'], ['--s-6', '24px'], ['--s-7', '32px'], ['--s-8', '40px'], ['--s-9', '56px'], ['--s-10', '72px'], ['--s-11', '96px']],
  radius: [['--r', '2px', 'Buttons, fields, chips, table rows'], ['--r-lg', '3px', 'Panels, ledgers'], ['50%', 'circle', 'Status material only']],
  motion: [['--t-fast', '120ms', 'Hover, press'], ['--t', '180ms', 'Colour and border changes'], ['--t-slow', '350ms', 'Story step fade'], ['--ease', 'cubic-bezier(.2,.7,.2,1)', 'Everything that moves in the interface'], ['curtain', '620ms cubic-bezier(.7,0,.2,1)', 'Launch App circle wipe'], ['scene rate', '3.4 / s', 'Scroll-linked 3D easing (exponential)'], ['intro rate', '1.7 / s', 'One-time assembly on load']]
};

DATA.rings = [
  ['0', 'Recipient', 'Example address', 158, 'A'],
  ['1', 'Chain ID', '46630', 148, 'B'],
  ['2', 'Token in and out', 'TKN-A to TKN-B', 138, 'A'],
  ['3', 'Amount', 'Example', 129, 'B'],
  ['4', 'Router and allowance', 'Not configured', 121, 'A'],
  ['5', 'Slippage and minimum out', 'Example', 113, 'B'],
  ['6', 'Nonce', 'Example', 106, 'A'],
  ['7', 'Deadline', 'Example', 99, 'B']
];

DATA.keyNames = ['Hero', 'Every detail gets a ring', 'Review, rings turn into place', 'Change one detail', 'Experimental outline', 'Security Swarm', 'Closing'];

/* ---------- app fixtures ---------- */
DATA.bst = {
  connect:  { l: 'Connect wallet', sev: 'info', dis: 0, cause: 'No wallet is connected.', not: 'Nothing was requested from your wallet.' },
  network:  { l: 'Switch network', sev: 'blocked', dis: 0, cause: 'Your wallet is on another network. Expected: Robinhood Testnet (46630).', not: 'No transaction was sent.' },
  account:  { l: 'Create QEVRA account', sev: 'blocked', dis: 0, cause: 'You have no QEVRA smart account yet. Swaps use that account, not your connected wallet.', not: 'No assets are held in a QEVRA account, so none are protected by it.' },
  key:      { l: 'Register authorization key', sev: 'blocked', dis: 0, cause: 'The account needs an authorization key before it can swap. This part is experimental.', not: 'No key was created and nothing was signed.' },
  fund:     { l: 'Fund your QEVRA account', sev: 'info', dis: 0, cause: 'The QEVRA account holds no assets to swap.', not: 'No transaction was sent.' },
  amount:   { l: 'Enter amount', sev: 'info', dis: 1, cause: 'Type an amount to swap.', not: 'Nothing has been reviewed yet.' },
  balance:  { l: 'Insufficient TKN-A', sev: 'blocked', dis: 1, cause: 'The QEVRA account holds less TKN-A than this amount.', not: 'No transaction was sent.' },
  gas:      { l: 'Insufficient gas', sev: 'blocked', dis: 1, cause: 'The QEVRA account cannot cover the network fee.', not: 'No transaction was sent.' },
  expired:  { l: 'Quote expired, refresh', sev: 'blocked', dis: 0, cause: 'The quote ran out of time, so the intent has to be checked again.', not: 'No transaction was sent.' },
  review:   { l: 'Review intent', sev: 'info', dis: 0, cause: 'Check every detail in the Intent Lock, then review it. Nothing is signed by reviewing.', not: 'Nothing has been signed.' },
  rereview: { l: 'Review intent again', sev: 'blocked', dis: 0, cause: 'A detail changed after you reviewed. Review the new details before you sign.', not: 'Nothing has been signed.' },
  route:    { l: 'Route unavailable', sev: 'blocked', dis: 1, cause: 'You reviewed these details. No verified route is configured, so signing is switched off.', not: 'No quote is shown, because none exists.' },
  awaiting: { l: 'Awaiting wallet approval', sev: 'info', dis: 1, cause: 'Your wallet is asking you to approve.', not: 'Nothing is sent until you approve.' },
  pending:  { l: 'Pending', sev: 'info', dis: 1, cause: 'The transaction was sent and is waiting for the chain to confirm it.', not: 'It is not final yet. No result is shown until the chain reports one.' },
  confirmed:{ l: 'Confirmed', sev: 'done', dis: 1, cause: 'The chain confirmed the transaction.', not: 'A link to the block explorer appears here for a real transaction.' },
  reverted: { l: 'Reverted', sev: 'failed', dis: 1, cause: 'The transaction reverted, so the swap did not happen.', not: 'Network fees may have been spent.' },
  rejected: { l: 'Rejected', sev: 'info', dis: 1, cause: 'You declined the request in your wallet.', not: 'No transaction was sent.' }
};
DATA.bstOrder = ['connect', 'network', 'account', 'key', 'fund', 'amount', 'balance', 'gas', 'expired', 'review', 'rereview', 'route', 'awaiting', 'pending', 'confirmed', 'reverted', 'rejected'];

DATA.runs = [
  { id: 'RUN-EXAMPLE-01', role: 'Source watcher', goal: 'Watch public advisories for notices about ML-DSA libraries', k: 'exp', st: 'Needs human review', mat: 'outline',
    shows: 'Which public advisories mention a library QEVRA would depend on.', how: 'Reads a fixed list of public pages and records the time each one was read.', not: 'It does not say the library is safe, and it cannot see private disclosures.', lim: 'Example run. No real source was read.', ev: 'Two source links would be listed here, each with the time it was read.' },
  { id: 'RUN-EXAMPLE-02', role: 'Test agent', goal: 'Check that a changed amount is never treated as the reviewed one', k: 'unk', st: 'Queued', mat: 'dotted',
    shows: 'Whether the comparison treats a changed amount as a different intent.', how: 'A named, deterministic test that compares two example intents field by field.', not: 'It does not test your wallet, the chain or a router.', lim: 'Queued, not run. Passed can appear only after a recorded run.', ev: 'No evidence yet. A test result would link to its definition.' },
  { id: 'RUN-EXAMPLE-03', role: 'Skeptic', goal: 'Look for a claim that goes further than its evidence', k: 'bad', st: 'Finding detected', mat: 'outline', withheld: true,
    shows: 'A claim in the public copy that no recorded evidence supports.', how: 'Compares each claim in a list of public pages with the evidence list.', not: 'It does not say the claim is false, only that no evidence is recorded.', lim: 'Example finding. Severity is labelled and the details are withheld.', ev: 'One footnote would point at the page and the claim.' }
];

DATA.acts = [
  { id: 1, st: 'Pending', k: 'unk', mat: 'dotted', s: 'Swap 100 TKN-A for TKN-B, up to 0.5% slippage', amt: '100 TKN-A', note: 'Waiting for the chain to confirm. No result is shown until it reports one.' },
  { id: 2, st: 'Confirmed', k: '', mat: 'solid', s: 'Swap 40 TKN-A for TKN-B, up to 0.5% slippage', amt: '40 TKN-A', note: 'The chain confirmed this transaction. A link to the block explorer appears here for a real one.' },
  { id: 3, st: 'Reverted', k: 'bad', mat: 'solid', s: 'Swap 250 TKN-A for TKN-B, up to 0.5% slippage', amt: '250 TKN-A', note: 'The swap did not happen. Network fees may have been spent, even though the swap failed.' },
  { id: 4, st: 'Rejected', k: 'unk', mat: 'outline', s: 'Swap 10 TKN-A for TKN-B, up to 0.5% slippage', amt: '10 TKN-A', note: 'You declined the request in your wallet. No transaction was sent.' }
];

DATA.cov = [
  ['Wallet connection', 'unk', 'dotted', 'Design preview', 'Not built. The Connect wallet button only changes this page.'],
  ['QEVRA smart account', 'exp', 'outline', 'Experimental', 'Design preview. No contract exists in this page.'],
  ['ML-DSA authorization', 'exp', 'outline', 'Under evaluation', 'The initial candidate scheme (NIST FIPS 204). QEVRA makes no claim that it resists quantum attacks.'],
  ['Key control and recovery', 'unk', 'dotted', 'Not decided', 'Which key controls the account, and what the connected wallet can do after setup, is still being designed.'],
  ['Intent Lock comparison', 'unk', 'dotted', 'Design preview', 'A field-by-field comparison on example values. No test is recorded as passed.'],
  ['Simple swap route', 'unk', 'dotted', 'Not configured', 'No router is set, so no quote is shown.'],
  ['Security Swarm runs', 'demo', 'outline', 'Examples only', 'DEMO DATA. No run has been done.'],
  ['Responsible disclosure path', 'unk', 'dotted', 'Not published', 'No reporting path exists yet.'],
  ['Independent audit', 'unk', 'dotted', 'No audit yet', 'No audit has been completed.']
];

DATA.ringHelp = [
  'Recipient: who receives the swapped tokens.', 'Chain: 46630, Robinhood Testnet.', 'Tokens: TKN-A to TKN-B, example tokens.', 'Amount: what you pay.', 'Router and allowance: not configured.', 'Slippage and minimum out: the worst price you accept.', 'Nonce: a one-time number.', 'Deadline: when the review runs out.'
];
