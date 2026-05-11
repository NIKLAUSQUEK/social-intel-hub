/**
 * Static framework library — hooks, structures, platform patterns.
 * Beta / placeholder content. User can extend this file with their own proven frameworks.
 */

export const HOOK_FRAMEWORKS = [
  {
    id: 'hook-pattern-interrupt',
    name: 'Pattern Interrupt',
    description: 'Start with an unexpected claim or image to stop the scroll',
    examples: [
      '"Everyone is wrong about X."',
      '"Nobody is talking about this."',
      '"I was today years old when I learned…"',
    ],
    bestFor: ['Reel', 'TikTok', 'Shorts'],
  },
  {
    id: 'hook-curiosity-gap',
    name: 'Curiosity Gap',
    description: 'Tease the answer without revealing it upfront',
    examples: [
      '"The 3 mistakes killing your conversion rate."',
      '"What happened next will surprise you."',
    ],
    bestFor: ['Reel', 'TikTok', 'YouTube Shorts'],
  },
  {
    id: 'hook-result-first',
    name: 'Result First',
    description: 'Show the outcome, then explain how',
    examples: [
      '"I went from 0 to 100k followers in 6 months. Here is the exact system."',
      '"This £10k deposit turned into £400k."',
    ],
    bestFor: ['LinkedIn carousel', 'TikTok', 'Reel'],
  },
  {
    id: 'hook-direct-question',
    name: 'Direct Question',
    description: 'Ask viewers a question that speaks to their pain',
    examples: [
      '"Tired of feeling stuck in your career?"',
      '"Why do most property investors fail in year 3?"',
    ],
    bestFor: ['LinkedIn post', 'Reel'],
  },
  {
    id: 'hook-contrarian',
    name: 'Contrarian Take',
    description: 'Challenge a widely held belief in your niche',
    examples: [
      '"Everything you know about productivity is wrong."',
      '"Stop saving money. Do this instead."',
    ],
    bestFor: ['LinkedIn thought leadership', 'TikTok', 'Reel'],
  },
];

export const VIDEO_STRUCTURE_FRAMEWORKS = [
  {
    id: 'arc-status',
    name: 'Arc & Status (filmmaking)',
    description: 'Every scene must change a character\'s status (power, knowledge, ally count). Scene ends when status has flipped.',
    stages: [
      { beat: 'Opening status', note: 'Where the subject stands at the start — weak, confused, underdog' },
      { beat: 'Destabilising event', note: 'A challenge, a question, a reveal that pushes them off balance' },
      { beat: 'Rising stakes', note: 'Obstacles or counter-arguments escalate' },
      { beat: 'Status flip', note: 'Subject (or viewer\'s understanding) moves to a new position of power / insight' },
      { beat: 'Closing state', note: 'Rest point that sets up the next scene or CTA' },
    ],
    bestFor: ['Long-form vlog', 'Reel narrative', 'Case study'],
    note: 'From David Mamet\'s dramaturgy — translates well to short-form when compressed to 40-60s',
  },
  {
    id: 'hook-retain-deliver',
    name: 'Hook → Retain → Deliver → CTA',
    description: 'The short-form default: 4-act within 60 seconds',
    stages: [
      { beat: 'Hook (0-3s)', note: 'Pattern break, promise, bold claim' },
      { beat: 'Retain (3-15s)', note: 'Set up context, introduce the tension' },
      { beat: 'Deliver (15-45s)', note: 'The meat — reveal the insight, the steps, the punchline' },
      { beat: 'CTA (45-60s)', note: 'Comment, follow, save, link — one ask only' },
    ],
    bestFor: ['Reel', 'TikTok', 'YouTube Shorts'],
  },
  {
    id: 'problem-agitate-solution',
    name: 'Problem → Agitate → Solution (PAS)',
    description: 'Classic direct response for sales-adjacent content',
    stages: [
      { beat: 'Problem', note: 'Name the viewer\'s pain point specifically' },
      { beat: 'Agitate', note: 'Amplify the cost of inaction — quantify what it means to not fix this' },
      { beat: 'Solution', note: 'Introduce your approach — make it feel obvious in retrospect' },
    ],
    bestFor: ['LinkedIn carousel', 'Sales reel', 'Email-style posts'],
  },
  {
    id: 'mini-doc',
    name: 'Mini-Documentary',
    description: '60-90s documentary cut with B-roll, interviews, and data overlays',
    stages: [
      { beat: 'Cold open', note: 'Image or quote that hints at the subject' },
      { beat: 'Title card', note: 'State the question or claim' },
      { beat: 'Evidence montage', note: 'Rapid-cut data + B-roll that builds the argument' },
      { beat: 'Verdict', note: 'One-sentence takeaway' },
      { beat: 'Credits / CTA', note: 'Brand mark + link' },
    ],
    bestFor: ['LinkedIn video', 'YouTube Shorts', 'Creator brand'],
  },
  {
    id: 'day-in-the-life',
    name: 'Day in the Life',
    description: 'Structured routine captures with narration layered over daily activity',
    stages: [
      { beat: '6am-ish wake', note: 'Aspirational morning routine' },
      { beat: 'Work block 1', note: 'Show the actual craft — writing, filming, client calls' },
      { beat: 'Tension moment', note: 'A problem or decision to solve' },
      { beat: 'Work block 2', note: 'Resolution or learning' },
      { beat: 'Evening reflection', note: 'Meta-commentary on what was learned' },
    ],
    bestFor: ['Creator accounts', 'LinkedIn founder content', 'Instagram Reels'],
  },
];

export const FUNNEL_GUIDANCE = {
  TOF: {
    label: 'Top of Funnel — Awareness',
    purpose: 'Pull strangers into orbit. Goal is reach + retention, not conversion.',
    typicalFrequency: '60% of posting cadence',
    formats: ['Reel', 'TikTok', 'Hook carousel', 'Meme + commentary'],
    hookStyle: 'Pattern interrupt, contrarian, curiosity gap',
    successMetrics: ['reach', 'completion rate', 'follows gained'],
  },
  MOF: {
    label: 'Middle of Funnel — Consideration',
    purpose: 'Build trust + authority. Show the method, the proof, the system.',
    typicalFrequency: '30% of posting cadence',
    formats: ['Case study', 'Teaching carousel', 'Behind the scenes', 'Mini-doc'],
    hookStyle: 'Result-first, data-led claim, story-driven',
    successMetrics: ['saves', 'shares', 'profile visits', 'DM starts'],
  },
  BOF: {
    label: 'Bottom of Funnel — Conversion',
    purpose: 'Ask. Offer the consult, the product, the waitlist.',
    typicalFrequency: '10% of posting cadence',
    formats: ['Offer reel', 'Testimonial', 'Direct CTA post', 'Live Q&A'],
    hookStyle: 'Direct address, problem-agitate-solution, time-boxed urgency',
    successMetrics: ['link clicks', 'DMs', 'bookings', 'signups'],
  },
};

export const PLATFORM_POSTING_CADENCE = {
  instagram: {
    optimal: { reels: '4-6/week', carousels: '2-3/week', stories: 'daily' },
    primeTime: ['Mon 11am-1pm', 'Wed 5-7pm', 'Fri 11am-1pm'],
    note: 'Reels drive discovery. Carousels drive saves. Stories drive trust.',
  },
  tiktok: {
    optimal: { videos: '1-3/day' },
    primeTime: ['Tue-Thu 6-10pm', 'weekends 9am-12pm'],
    note: 'Frequency beats polish. Post consistently, not perfectly.',
  },
  linkedin: {
    optimal: { posts: '3-5/week', articles: '1-2/month' },
    primeTime: ['Tue-Thu 7-9am', 'Tue-Thu 12-1pm'],
    note: 'Text posts with 1 hook line + 5-10 short paragraphs outperform links.',
  },
  facebook: {
    optimal: { posts: '3-5/week' },
    primeTime: ['Tue-Thu 1-3pm'],
    note: 'Facebook organic reach is low. Prioritise community/groups over pages.',
  },
};

export const BATCHING_PATTERNS = [
  {
    name: 'Weekly sprint',
    description: 'One filming day per week — produces 5-7 short-form pieces',
    cadence: 'e.g. every Saturday AM',
    outputs: '3 Reels + 2 TikToks + 1 carousel + B-roll reserve',
  },
  {
    name: 'Monthly bulk shoot',
    description: 'One full day/month — produces a month of content',
    cadence: 'first Saturday of each month',
    outputs: '12-16 short-form pieces + 1 longer anchor video',
  },
  {
    name: 'Paired-topic batch',
    description: 'Group content by theme per filming session for wardrobe/set consistency',
    cadence: 'monthly with sub-themes per week',
    outputs: 'Week 1 = Topic A, Week 2 = Topic B, filmed all at once',
  },
];

export function allFrameworks() {
  return {
    hooks: HOOK_FRAMEWORKS,
    structures: VIDEO_STRUCTURE_FRAMEWORKS,
    funnel: FUNNEL_GUIDANCE,
    cadence: PLATFORM_POSTING_CADENCE,
    batching: BATCHING_PATTERNS,
  };
}
