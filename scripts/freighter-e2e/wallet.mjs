import * as bip39 from 'bip39'; import { derivePath } from 'ed25519-hd-key'
import { Keypair, Horizon, Asset, Operation, TransactionBuilder, Networks } from '@stellar/stellar-sdk'
import fs from 'node:fs'
const mnemonic = bip39.generateMnemonic(128)
const seed = bip39.mnemonicToSeedSync(mnemonic).toString('hex')
const kp = Keypair.fromRawEd25519Seed(derivePath("m/44'/148'/0'", seed).key)
console.log('pub', kp.publicKey())
await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`)
const h = new Horizon.Server('https://horizon-testnet.stellar.org')
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
let acc = await h.loadAccount(kp.publicKey())
let tx = new TransactionBuilder(acc, { fee: '10000', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.changeTrust({ asset: USDC }))
  .addOperation(Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: '500', destination: kp.publicKey(), destAsset: USDC, destAmount: '5' }))
  .setTimeout(60).build(); tx.sign(kp); await h.submitTransaction(tx)
acc = await h.loadAccount(kp.publicKey())
console.log('balances', acc.balances.map(b => `${b.asset_code ?? 'XLM'} ${b.balance}`).join(', '))
fs.writeFileSync('wallet.json', JSON.stringify({ mnemonic, pub: kp.publicKey() }))
