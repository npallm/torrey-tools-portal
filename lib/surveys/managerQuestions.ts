/**
 * Manager-effectiveness question bank: 4 categories × 5 items, all 1–5 Likert
 * (1 = Strongly disagree … 5 = Strongly agree). Seeded into survey_question_bank;
 * edit there (or here for new orgs).
 */
export const LIKERT_LABELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"] as const;

export const MANAGER_CATEGORIES = [
  "Direction & Clarity",
  "Coaching & Growth",
  "Trust & Inclusion",
  "Empowerment & Wellbeing",
] as const;
export type ManagerCategory = (typeof MANAGER_CATEGORIES)[number];

export const MANAGER_QUESTION_BANK: { category: ManagerCategory; prompt: string }[] = [
  { category: "Direction & Clarity", prompt: "My manager helps me understand how my work connects to our team's and the organization's goals." },
  { category: "Direction & Clarity", prompt: "My manager sets clear priorities and helps me let go of work that matters less." },
  { category: "Direction & Clarity", prompt: "My manager explains the reasoning behind decisions that affect our team." },
  { category: "Direction & Clarity", prompt: "My manager adapts our plans quickly and transparently when circumstances change." },
  { category: "Direction & Clarity", prompt: "My manager and I agree on what success looks like in my role." },
  { category: "Coaching & Growth", prompt: "My manager gives me specific, timely feedback that helps me improve." },
  { category: "Coaching & Growth", prompt: "My manager regularly talks with me about my career goals and development." },
  { category: "Coaching & Growth", prompt: "My manager creates opportunities for me to build new skills, including stretch assignments." },
  { category: "Coaching & Growth", prompt: "My manager recognizes my contributions in ways that are meaningful to me." },
  { category: "Coaching & Growth", prompt: "My 1:1 conversations with my manager are a valuable use of my time." },
  { category: "Trust & Inclusion", prompt: "I feel safe raising concerns, admitting mistakes, or disagreeing with my manager." },
  { category: "Trust & Inclusion", prompt: "My manager treats everyone on our team fairly and with respect." },
  { category: "Trust & Inclusion", prompt: "My manager actively seeks out perspectives different from their own." },
  { category: "Trust & Inclusion", prompt: "My manager follows through on commitments." },
  { category: "Trust & Inclusion", prompt: "My manager makes sure everyone on the team has a voice in discussions." },
  { category: "Empowerment & Wellbeing", prompt: "My manager trusts me to decide how I get my work done." },
  { category: "Empowerment & Wellbeing", prompt: "My manager removes obstacles that slow me down." },
  { category: "Empowerment & Wellbeing", prompt: "My manager supports a sustainable workload and respects my time outside of work." },
  { category: "Empowerment & Wellbeing", prompt: "My manager supports flexibility in when and where I work, where the role allows." },
  { category: "Empowerment & Wellbeing", prompt: "My manager cares about my wellbeing as a person, not only my output." },
];
