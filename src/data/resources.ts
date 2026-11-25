export interface OpenResource {
  id: string;
  provider: 'GO Classes' | 'GATE Overflow' | 'IIT Madras';
  title: string;
  description: string;
  url: string;
  subjectsCovered: string;
  tag: string;
}

export const OPEN_RESOURCES: OpenResource[] = [
  {
    id: 'res-go-dm',
    provider: 'GO Classes',
    title: 'Free Discrete Mathematics Complete Course',
    description: 'First-principles lectures by Deepak Poonia & Sachin Mittal covering Logic, Set Theory, Combinatorics, Graph Theory, and Group Theory with GATE PYQs.',
    url: 'https://www.goclasses.in/courses/Discrete-Mathematics',
    subjectsCovered: 'Engineering Mathematics (Discrete)',
    tag: 'Free Full Course',
  },
  {
    id: 'res-go-em',
    provider: 'GO Classes',
    title: 'Free Engineering Mathematics Complete Course',
    description: 'Complete Linear Algebra, Calculus, and Probability & Statistics lectures tailored specifically for GATE CSE conceptual rigor.',
    url: 'https://www.goclasses.in/courses/Engineering-Mathematics',
    subjectsCovered: 'Linear Algebra · Calculus · Probability',
    tag: 'Free Full Course',
  },
  {
    id: 'res-go-c',
    provider: 'GO Classes',
    title: 'Free C Programming & Daily Practice Portal (DPPs)',
    description: 'Open access to C Programming fundamentals plus topic-wise Daily Practice Problems (DPPs) focused on root-of-the-concept edge cases.',
    url: 'https://www.goclasses.in/s/store',
    subjectsCovered: 'C Programming · Mixed DPPs',
    tag: 'Open DPPs',
  },
  {
    id: 'res-go-yt',
    provider: 'GO Classes',
    title: 'GO Classes GATE CSE YouTube Playlists & Marathons',
    description: 'Subject revision marathons, MSQ workshops, standard textbook question discussions, and previous year paper live analyses.',
    url: 'https://www.youtube.com/@GOCLASSES',
    subjectsCovered: 'All 11 GATE CSE Subjects',
    tag: 'Video Archive',
  },
  {
    id: 'res-gateoverflow-pyq',
    provider: 'GATE Overflow',
    title: 'GATE Overflow Subject-Wise PYQ Archive (1991–2026)',
    description: 'Community-vetted open repository of every official GATE CSE Previous Year Question with peer-reviewed proofs, counterexamples, and textbook citations.',
    url: 'https://gateoverflow.in/questions',
    subjectsCovered: 'All 11 GATE CSE Subjects',
    tag: 'Open PYQ Archive',
  },
  {
    id: 'res-gateoverflow-pdf',
    provider: 'GATE Overflow',
    title: 'GATE Overflow Open-Source PYQ Volumes & Tags',
    description: 'Filter questions by exact GATE CSE subtopic tags, difficulty votes, and official IIT answer keys for systematic revision.',
    url: 'https://gateoverflow.in/tags',
    subjectsCovered: 'Tag-Indexed Topic Drills',
    tag: 'Structured Index',
  },
  {
    id: 'res-go-test',
    provider: 'GATE Overflow',
    title: 'GO Classes & GATE Overflow Joint AIMT Archive',
    description: 'All-India Mock Tests and high-rigor standard textbook question sets engineered to eliminate superficial pattern matching.',
    url: 'https://gateoverflow.in/blog',
    subjectsCovered: 'Full-Length Mocks & Analysis',
    tag: 'Mock Archive',
  },
  {
    id: 'res-iitm-syllabus',
    provider: 'IIT Madras',
    title: 'Official GATE 2027 CSE Syllabus Reference',
    description: 'Verify exact 2027 inclusions and removals (COA Secondary Storage dropped; CN ARP/ICMP/DHCP/SMTP/FTP/UDP dropped) directly against the organizing institute bulletin.',
    url: 'https://gate.iitm.ac.in',
    subjectsCovered: 'Official 2027 Syllabus',
    tag: 'Official Spec',
  },
];

export const SAMPLE_IMPORT_JSON = JSON.stringify(
  [
    {
      subjectId: 'algo',
      subtopic: 'Graph Algorithms · MST',
      format: 'NAT',
      marks: 2,
      difficulty: 'Medium',
      sourceTag: 'Open PYQ Import',
      prompt:
        'How many distinct spanning trees exist in a complete graph K_5 on 5 labeled vertices?',
      natAnswer: 125,
      natTolerance: 0,
      natUnit: 'trees',
      explanation:
        'By Cayley\'s formula, a complete labeled graph K_n has n^(n−2) distinct spanning trees. For n = 5, this equals 5^(5−2) = 5^3 = 125.',
      wrongOptionAnalysis:
        'Common mistake: confusing labeled spanning trees (n^(n−2)) with total subgraphs or using (n−1)! = 24 (which counts Hamiltonian cycles/orderings, not spanning trees).',
    },
    {
      subjectId: 'toc',
      subtopic: 'Closure Properties',
      format: 'MSQ',
      marks: 2,
      difficulty: 'Hard',
      sourceTag: 'GO-Style Concept DPP',
      prompt:
        'Which of the following language classes are closed under complementation?',
      options: [
        { id: 'A', text: 'Regular languages' },
        { id: 'B', text: 'Deterministic Context-Free Languages (DCFL)' },
        { id: 'C', text: 'Context-Free Languages (CFL)' },
        { id: 'D', text: 'Recursive (Decidable) languages' },
      ],
      correctOptions: ['A', 'B', 'D'],
      explanation:
        'Regular languages (swap accepting/non-accepting states in a complete DFA), DCFLs (swap accepting states in a complete halting DPDA), and Recursive languages (swap accept/reject in a halting TM) are all closed under complementation.',
      wrongOptionAnalysis:
        'Option C fails: CFLs are NOT closed under complementation. If they were, since CFLs are closed under union, De Morgan\'s law would imply closure under intersection, contradicting {a^n b^n c^n} = {a^n b^n c^m} ∩ {a^m b^n c^n}.',
    },
  ],
  null,
  2
);
