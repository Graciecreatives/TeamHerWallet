/**
 * Free learning resources the agent can point to while a paid class doesn't exist yet.
 * A fixed list, so the AI can never invent a link. Optional Apify web search adds more (see server/utils/free-resources.ts).
 */
export interface FreeResource { title: string; url: string; provider: string; tags: string[]; ages?: string }

export const FREE_RESOURCES: FreeResource[] = [
  { title: 'Khan Academy Math (by grade)', url: 'https://www.khanacademy.org/math', provider: 'Khan Academy', tags: ['math', 'maths', 'mathematics', 'arithmetic', 'algebra', 'geometry', 'fractions', 'numbers', 'calculus', 'statistics'], ages: 'all ages' },
  { title: 'Khan Academy Kids', url: 'https://learn.khanacademy.org/khan-academy-kids/', provider: 'Khan Academy', tags: ['kids', 'reading', 'math', 'maths', 'early', 'phonics', 'preschool'], ages: '2 to 8' },
  { title: 'Khan Academy Science', url: 'https://www.khanacademy.org/science', provider: 'Khan Academy', tags: ['science', 'biology', 'chemistry', 'physics'], ages: 'teens and adults' },
  { title: 'Khan Academy Personal Finance', url: 'https://www.khanacademy.org/college-careers-more/personal-finance', provider: 'Khan Academy', tags: ['money', 'finance', 'budget', 'budgeting', 'saving', 'savings', 'debt', 'investing'] },
  { title: 'BBC Bitesize', url: 'https://www.bbc.co.uk/bitesize', provider: 'BBC', tags: ['school', 'math', 'maths', 'english', 'science', 'history', 'geography', 'exam', 'gcse', 'kids'], ages: '4 to 16' },
  { title: 'Scratch (learn to code by making games)', url: 'https://scratch.mit.edu/', provider: 'MIT', tags: ['coding', 'code', 'programming', 'kids', 'games', 'computer', 'scratch'], ages: '8 to 16' },
  { title: 'Code.org courses', url: 'https://code.org/learn', provider: 'Code.org', tags: ['coding', 'code', 'programming', 'computer', 'science', 'kids', 'ai'], ages: '4 to 18' },
  { title: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn', provider: 'freeCodeCamp', tags: ['coding', 'code', 'programming', 'web', 'javascript', 'python', 'developer', 'html', 'css', 'data'] },
  { title: 'CS50 (Harvard intro to computer science)', url: 'https://cs50.harvard.edu/x/', provider: 'Harvard', tags: ['coding', 'programming', 'computer', 'science', 'python', 'c'] },
  { title: 'Duolingo', url: 'https://www.duolingo.com/', provider: 'Duolingo', tags: ['language', 'languages', 'spanish', 'french', 'german', 'english', 'swahili', 'yoruba', 'zulu', 'italian', 'portuguese'] },
  { title: 'BBC Learning English', url: 'https://www.bbc.co.uk/learningenglish', provider: 'BBC', tags: ['english', 'grammar', 'speaking', 'vocabulary', 'language'] },
  { title: 'British Council LearnEnglish Kids', url: 'https://learnenglishkids.britishcouncil.org/', provider: 'British Council', tags: ['english', 'kids', 'reading', 'phonics', 'language'], ages: '5 to 12' },
  { title: 'Storyweaver (free children’s books in many languages)', url: 'https://storyweaver.org.in/', provider: 'Pratham Books', tags: ['reading', 'stories', 'kids', 'books', 'language', 'literacy'], ages: '3 to 12' },
  { title: 'Google Digital Garage', url: 'https://learndigital.withgoogle.com/digitalgarage', provider: 'Google', tags: ['marketing', 'business', 'digital', 'online', 'career', 'social', 'media', 'sell', 'selling', 'shop'] },
  { title: 'Grow with Google', url: 'https://grow.google/', provider: 'Google', tags: ['career', 'business', 'data', 'it', 'skills', 'jobs', 'ux', 'design'] },
  { title: 'OpenLearn (Open University free courses)', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', tags: ['business', 'health', 'science', 'history', 'psychology', 'education', 'money', 'nature', 'languages'] },
  { title: 'Coursera free courses (audit for free)', url: 'https://www.coursera.org/courses?query=free', provider: 'Coursera', tags: ['university', 'business', 'data', 'computer', 'health', 'career'] },
  { title: 'edX free courses (audit for free)', url: 'https://www.edx.org/', provider: 'edX', tags: ['university', 'science', 'engineering', 'business', 'computer'] },
  { title: 'Canva Design School', url: 'https://www.canva.com/designschool/', provider: 'Canva', tags: ['design', 'graphics', 'branding', 'social', 'media', 'marketing'] },
  { title: 'Stellar Developer Docs', url: 'https://developers.stellar.org/docs', provider: 'Stellar', tags: ['blockchain', 'crypto', 'stellar', 'stablecoin', 'web3', 'developer', 'usdc'] },
  { title: 'Music Theory lessons', url: 'https://www.musictheory.net/lessons', provider: 'musictheory.net', tags: ['music', 'piano', 'theory', 'singing', 'guitar', 'harp', 'kora', 'violin', 'drum', 'drums', 'instrument', 'keyboard'] },
  { title: 'Chess lessons', url: 'https://lichess.org/learn', provider: 'Lichess', tags: ['chess', 'games', 'strategy', 'kids'] },
  { title: 'Crash Course (YouTube)', url: 'https://thecrashcourse.com/', provider: 'Crash Course', tags: ['history', 'science', 'biology', 'economics', 'literature', 'psychology'] },
]

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{2,}/g) ?? [])
const ALIASES: Record<string, string[]> = { math: ['maths', 'mathematics'], maths: ['math', 'mathematics'], mathematics: ['math', 'maths'], code: ['coding', 'programming'], coding: ['code', 'programming'], programming: ['coding', 'code'] }

/** Best matching free resources for a goal, best first. */
export function matchFreeResources(goal: string, limit = 3): FreeResource[] {
  const wanted = words(goal)
  for (const word of [...wanted]) for (const alias of ALIASES[word] ?? []) wanted.add(alias)
  return FREE_RESOURCES
    .map(resource => ({ resource, score: resource.tags.filter(tag => wanted.has(tag)).length }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => entry.resource)
}
