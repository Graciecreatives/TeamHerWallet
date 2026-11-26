# Real Freighter (Varial) browser payment test on Stellar Testnet

Loads the real Freighter extension in Chromium, imports a fresh funded Testnet wallet and pays for a class through the UI.

    cd scripts/freighter-e2e && npm i bip39 ed25519-hd-key @stellar/stellar-sdk
    # unpack the Freighter CRX into ./ext (Chrome Web Store id bcacfldlkkdogcmkkibnjlakofdplcbk)
    node wallet.mjs                 # new Testnet wallet: XLM from friendbot + 5 USDC trustline/balance
    xvfb-run -a node setup.mjs      # import wallet into the extension
    xvfb-run -a node net.mjs        # switch extension to Test Net
    xvfb-run -a node pay.mjs [baseUrl] [classId] [locked]

wallet.json holds a Testnet-only mnemonic. Never commit it.
