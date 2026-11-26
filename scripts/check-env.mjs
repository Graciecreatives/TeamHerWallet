// Checks the settings the running app actually reads for Stellar Testnet payments.
// Data lives in the Cloudflare D1 API worker; DATABASE_URL is only for the optional Postgres scripts.
const required = ['AI_API_KEY', 'X402_FACILITATOR_URL', 'CLOUD_API_URL', 'CLOUD_API_SECRET'].map(name => `NUXT_${name}`)
const optional = ['DATABASE_URL', 'NUXT_STELLAR_USDC_CONTRACT_ID', 'NUXT_AGENT_WALLET_KEY']
const missing = required.filter(name => !process.env[name]?.trim())
if ((process.env.NUXT_STELLAR_NETWORK ?? 'TESTNET') !== 'TESTNET') {
  console.error('NUXT_STELLAR_NETWORK must be TESTNET.')
  process.exitCode = 1
}
if (missing.length) {
  console.error(`Integration configuration incomplete:\n${missing.join('\n')}`)
  process.exitCode = 1
} else if (!process.exitCode) {
  const unset = optional.filter(name => !process.env[name]?.trim())
  console.log('Required Testnet settings present.' + (unset.length ? ` Optional and unset: ${unset.join(', ')}` : ''))
}
