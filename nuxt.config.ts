import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-22',
  devtools: { enabled: false },
  app: { head: { title: 'LearnPurse · Teach what you know. Get paid in USDC.', htmlAttrs: { lang: 'en' }, meta: [{ name: 'description', content: 'Tell LearnPurse’s AI assistant what you want to teach. It builds your class and payment page, and students pay in USDC on Stellar via x402 to enrol instantly. Runs on Stellar Testnet.' }, { name: 'theme-color', content: '#FFF9FC' }, { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }] } },
  nitro: { esbuild: { options: { target: 'es2020' } }, storage: { courses: { driver: 'fs', base: './.data/courses' }, 'student-learning': { driver: 'fs', base: './.data/student-learning' } } },
  css: ['~/assets/css/main.css', '~/assets/css/experience.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    aiProvider: 'gemini',
    aiProviderOptions: {
      gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', header: 'x-goog-api-key' },
      groq: { endpoint: 'https://api.groq.com/openai/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
    },
    aiApiKey: '',
    imageUploadUrl: '',
    imageUploadSecret: '',
    cloudApiUrl: '',
    cloudApiSecret: '',
    agentWalletKey: '',
    apifyToken: '',
    x402FacilitatorUrl: 'https://www.x402.org/facilitator',
    x402FacilitatorApiKey: '',
    stellarNetwork: 'TESTNET',
    stellarRpcUrl: 'https://soroban-testnet.stellar.org',
    stellarHorizonUrl: 'https://horizon-testnet.stellar.org',
    stellarUsdcContractId: '',
        learnpurseRegistryContractId: '',
    learnpurseRegistrarSecret: '',
    public: { appUrl: 'http://localhost:3000' },
  },
})
