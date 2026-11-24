const required = ['DATABASE_URL', ...[
  'AI_API_KEY', 'STELLAR_USDC_CONTRACT_ID', 'X402_FACILITATOR_URL',
  'LEARNPURSE_REGISTRY_CONTRACT_ID', 'LEARNPURSE_REGISTRAR_SECRET',
].map(name => `NUXT_${name}`)]
const missing = required.filter(name => !process.env[name]?.trim())
if (process.env.NUXT_STELLAR_NETWORK !== 'TESTNET') {
  console.error('NUXT_STELLAR_NETWORK must be TESTNET.')
  process.exitCode = 1
}
if (missing.length) {
  console.error(`Integration configuration incomplete:\n${missing.join('\n')}`)
  process.exitCode = 1
} else if (!process.exitCode) {
  console.log('Required settings present. This does not verify service credentials or facilitator compatibility.')
}
