// Publishes demo classes in common subjects (maths, coding, English, money, science) so learning agents
// have something to buy. Paid to a fresh Testnet creator wallet with a USDC trustline.
// Usage: node scripts/seed-common-classes.mjs [baseUrl]
import { creatorSession } from './lib/creator-session.mjs'
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
const BASE = process.argv[2] ?? 'http://localhost:3000'
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
const creator = Keypair.random()
await fetch(`https://friendbot.stellar.org?addr=${creator.publicKey()}`)
const account = await horizon.loadAccount(creator.publicKey())
const tx = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET }).addOperation(Operation.changeTrust({ asset: USDC })).setTimeout(60).build()
tx.sign(creator); await horizon.submitTransaction(tx)
const l = (title, description) => ({ title, description })
const classes = [
  { creatorName: 'Ms Adaeze Obi', image: 'creator-workspace', accent: '#2563eb', tagline: 'Maths that finally clicks', draft: { title: 'Primary Maths Made Fun', description: 'Small live classes that build confidence with numbers, times tables, fractions and word problems.', targetAudience: 'Children aged 7 to 11 who find maths hard', duration: '6 weeks', priceAmount: '3', capacity: '12', modules: [l('Number sense', 'Place value, rounding and mental maths tricks.'), l('Times tables', 'Patterns and games to learn tables by heart.'), l('Fractions', 'Halves, quarters and equivalent fractions with pictures.'), l('Word problems', 'Turning stories into sums, step by step.'), l('Maths challenge', 'A fun quiz to show what they learned.')] } },
  { creatorName: 'Zainab Bello', image: 'creator-home', accent: '#0f766e', tagline: 'Pass with a plan', draft: { title: 'Secondary School Maths: Algebra Basics', description: 'Clear, patient lessons on equations, expressions and graphs for exam preparation.', targetAudience: 'Teens aged 12 to 16 preparing for exams', duration: '5 weeks', priceAmount: '4', capacity: '20', modules: [l('Expressions', 'Simplifying and expanding brackets.'), l('Linear equations', 'Solving one and two step equations.'), l('Graphs', 'Plotting lines and reading gradients.'), l('Simultaneous equations', 'Two methods, when to use each.'), l('Exam practice', 'Timed questions and marking tips.')] } },
  { creatorName: 'Ifeoma Eze', image: 'creator-workspace', accent: '#9333ea', tagline: 'Build your first website', draft: { title: 'Coding for Girls: Build a Website', description: 'A beginner coding class where girls build and publish their own website with HTML and CSS.', targetAudience: 'Girls aged 11 to 16, no experience needed', duration: '4 weeks', priceAmount: '3', capacity: '20', modules: [l('How the web works', 'Browsers, pages and code.'), l('HTML', 'Headings, images and links.'), l('CSS', 'Colours, fonts and layout.'), l('Publish', 'Put the site online and share it.')] } },
  { creatorName: 'Grace Mensah', image: 'pottery', accent: '#dc2626', tagline: 'Speak up with confidence', draft: { title: 'Spoken English Confidence', description: 'Practise everyday spoken English in a friendly group: introductions, phone calls and interviews.', targetAudience: 'Adult women learning English as a second language', duration: '4 weeks', priceAmount: '2.5', capacity: '15', modules: [l('Introducing yourself', 'Clear, confident first impressions.'), l('Everyday conversations', 'Shops, school and the doctor.'), l('Phone and video calls', 'Phrases that help you stay calm.'), l('Job interview practice', 'Common questions and strong answers.')] } },
  { creatorName: 'Halima Yusuf', image: 'creator-home', accent: '#ca8a04', tagline: 'Know where every naira goes', draft: { title: 'Money Basics: Budgeting and Saving', description: 'Practical personal finance for women: budgets, saving goals, avoiding debt traps and stablecoin savings.', targetAudience: 'Women and teens managing their own money', duration: '3 weeks', priceAmount: '2', capacity: '40', modules: [l('Your money map', 'Track income and spending for one week.'), l('A budget that works', 'Needs, wants and saving first.'), l('Saving and stablecoins', 'Emergency funds and saving in USDC.')] } },
  { creatorName: 'Dr Ngozi Ade', image: 'creator-workspace', accent: '#16a34a', tagline: 'Science you can try at home', draft: { title: 'Kitchen Science for Kids', description: 'Hands-on science experiments with things from the kitchen, explained simply.', targetAudience: 'Children aged 6 to 11', duration: '4 weeks', priceAmount: '2', capacity: '15', modules: [l('Mixtures and solutions', 'Salt, sugar and what dissolves.'), l('Acids and bases', 'Red cabbage colour changes.'), l('Forces', 'Balloon rockets and paper planes.'), l('Plants', 'Grow a bean and watch it change.')] } },
]
for (const course of classes) {
  // Each demo creator gets a real (throwaway) creator account. Publishing requires a session.
  const session = await creatorSession(BASE, { name: course.creatorName, walletAddress: creator.publicKey() })
  const response = await session.call('/api/courses', { method: 'POST', body: JSON.stringify(course) })
  const body = await response.json()
  console.log(response.status, body.id ?? body)
}
console.log('creator', creator.publicKey())
