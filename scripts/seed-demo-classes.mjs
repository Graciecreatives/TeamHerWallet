// Publishes demo classes paid to a fresh Testnet creator wallet with a USDC trustline.
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
const lesson = (title, description) => ({ title, description })
const classes = [
  { creatorName: 'Mama Funmi', image: 'creator-home', accent: '#f97316', tagline: 'Speak with grandma by the end', draft: { title: 'Yoruba for Kids Abroad', description: 'Playful live lessons that help children growing up outside Nigeria speak everyday Yoruba with family.', targetAudience: 'Children aged 6 to 12 with Yoruba-speaking families abroad', duration: '6 weeks', priceAmount: '2', capacity: '15', modules: [lesson('Sounds and greetings', 'Tones, greetings and how to greet elders respectfully.'), lesson('Family words', 'Names for family members and talking about your family.'), lesson('Numbers and colours', 'Counting to 20 and colours through games.'), lesson('Songs and games', 'Traditional songs and games to practise speaking.'), lesson('Talk with grandma', 'A guided video call practice with family.')] } },
  { creatorName: 'Chidinma Okafor', image: 'creator-workspace', accent: '#7c3aed', tagline: 'From zero to first sale', draft: { title: 'Sell Your Crafts Online', description: 'For women makers: photograph, price and sell handmade goods online and accept stablecoin payments.', targetAudience: 'Women artisans and small makers', duration: '4 weeks', priceAmount: '4', capacity: '30', modules: [lesson('Photograph your product', 'Phone photography with natural light.'), lesson('Price for profit', 'Cost, margin and pricing that pays you.'), lesson('Open your shop', 'Set up a simple storefront.'), lesson('Get paid in USDC', 'Receive stablecoin payments on Stellar.')] } },
  { creatorName: 'Amara Ndu', image: 'pottery', accent: '#0ea5e9', tagline: 'Stories that stick', draft: { title: 'Igbo Folktales for Children', description: 'Learn basic Igbo through classic folktales, told and acted out together.', targetAudience: 'Children aged 5 to 10', duration: '3 weeks', priceAmount: '1.5', capacity: '20', modules: [lesson('Tortoise and the birds', 'A classic tale with key Igbo words.'), lesson('Why the sky is far', 'Story, vocabulary and drawing.'), lesson('Act it out', 'Children retell a story in Igbo.')] } },
]
for (const course of classes) {
  // Each demo creator gets a real (throwaway) creator account. Publishing requires a session.
  const session = await creatorSession(BASE, { name: course.creatorName, walletAddress: creator.publicKey() })
  const response = await session.call('/api/courses', { method: 'POST', body: JSON.stringify(course) })
  const body = await response.json()
  console.log(response.status, body.id ?? body)
}
console.log('creator', creator.publicKey())
