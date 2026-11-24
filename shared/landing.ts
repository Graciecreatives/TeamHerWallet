import type { CourseDraft } from './course.ts'
import { starterExamples } from './studio-flow.ts'

export const courseShowcases: { id: string; category: string; image: string; alt: string; draft: CourseDraft }[] = [
  {
    id: 'budget', category: 'Money, made practical', image: 'creator-home',
    alt: 'A woman at her laptop in a bright home workspace',
    draft: starterExamples[0]!.draft,
  },
  {
    id: 'pottery', category: 'A skill worth passing on', image: 'pottery',
    alt: 'Hands shaping clay on a pottery wheel',
    draft: {
      title: 'Your first wheel-thrown bowl',
      description: 'A gentle introduction to working with clay. Learn to centre, open and shape a small bowl, with room to find your own rhythm.',
      targetAudience: 'First-time potters with access to a wheel', duration: '3 guided sessions', priceAmount: '35', capacity: '8',
      modules: [
        { title: 'Meet the clay', description: 'Prepare your clay, set up your space and learn how the wheel responds.' },
        { title: 'Find your centre', description: 'Practise centring and opening before pulling your first walls.' },
        { title: 'Make it yours', description: 'Shape the rim and learn what happens during drying, trimming and firing.' },
      ],
    },
  },
  {
    id: 'freelance', category: 'From experience to opportunity', image: 'creator-workspace',
    alt: 'A creator working beside a sunlit café window',
    draft: starterExamples[2]!.draft,
  },
]

export const landingQuestions = [
  { question: 'Can I sell a PDF without teaching a class?', answer: 'Yes. In the creator studio, choose a class, a PDF document, or a class + PDF bundle. Upload a PDF up to 20 MB and set its USDC price. The PDF stays in private storage and buyers can download it only after payment grants access. Payments currently use Testnet USDC, not real money.' },
  { question: 'Which path should I choose?', answer: 'Choose “I’m a learner” if you want classes for yourself or someone else. Choose “I’m a creator” only if you want to publish and sell classes, PDF guides or bundles. Creator buttons show a confirmation so you can switch to learning before signing up.' },
  { question: 'Do students need an account?', answer: 'No creator account is needed. Open a class link and pay with Freighter, or create a learning agent with a goal and spending limits. Keep your private agent console link safe, because it controls that agent.' },
  { question: 'What happens if no class matches?', answer: 'Your agent can post a request without the learner’s name or location and suggest free resources. When a creator publishes a class for that request, the agent checks your rules before buying or asking for approval.' },
  { question: 'What does the AI assistant actually do?', answer: 'You describe your class in one message, for example “a forex beginners’ class, $15, 30 students”. The assistant writes the listing, plans the lessons, sets the price and class size, and prepares a payment page. You review everything before it goes live.' },
  { question: 'How do students pay?', answer: 'Each class has a payment-protected access link built on x402. When a student enrols, the link answers with the exact USDC price, their Stellar wallet approves it, and the payment settles on Stellar straight to your wallet. Access unlocks automatically once it settles.' },
  { question: 'Do I need a wallet to start?', answer: 'You can build a class without one. To publish and get paid, add a Stellar public address during setup, with Freighter or by pasting it. Never enter a secret key or recovery phrase.' },
  { question: 'Is this real money?', answer: 'Not yet. LearnPurse runs on Stellar Testnet, so payments use Testnet USDC with no real value. Nothing here is a promise of earnings.' },
  { question: 'Where is my profile saved?', answer: 'Your creator account uses an email and password. Account information, published classes and enrolments are stored in our Cloudflare backend. Unpublished drafts and visual preferences are also saved in your browser. Agent access uses a separate private owner link.' },
] as const
