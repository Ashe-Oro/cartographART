import { createAppKit } from '@reown/appkit'
import { base, baseSepolia } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { privateKeyToAccount } from 'viem/accounts'
import { toHex, keccak256, encodePacked } from 'viem'

// ============================================
// PRODUCTION MODE - Real wallet connections required
// For testing on testnet, set VITE_TEST_MODE=true in .env
// ============================================
const TEST_MODE = import.meta.env.VITE_TEST_MODE === 'true'
const TEST_PRIVATE_KEY = import.meta.env.VITE_TEST_PRIVATE_KEY || ''

// Test account (derived from private key) - only for testnet testing
const testAccount = TEST_MODE && TEST_PRIVATE_KEY ? privateKeyToAccount(TEST_PRIVATE_KEY) : null

// Chain IDs
const CHAIN_IDS = {
  'base-sepolia': 84532,
  'eip155:84532': 84532,
  'base': 8453,
  'eip155:8453': 8453
}

// WalletConnect Project ID - Set VITE_WALLETCONNECT_PROJECT_ID in .env
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

if (!TEST_MODE && (!projectId || projectId === 'undefined')) {
  console.error('VITE_WALLETCONNECT_PROJECT_ID is not set. Get one at https://cloud.reown.com')
}

// Support both Base mainnet and Sepolia testnet
const networks = [base, baseSepolia]

// Create Wagmi adapter
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks
})

// Create AppKit modal
const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: 'Cartograph',
    description: 'Bespoke City Map Posters',
    url: window.location.origin,
    icons: [window.location.origin + '/static/img/logo.png']
  },
  features: {
    analytics: false
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#c9a87c',
    '--w3m-color-mix': '#0a0a0a',
    '--w3m-color-mix-strength': 40,
    '--w3m-border-radius-master': '2px'
  }
})

/**
 * Get the current connected wallet address
 * @returns {string|null} The connected address or null
 */
export function getAddress() {
  if (TEST_MODE && testAccount) {
    return testAccount.address
  }
  return modal.getAddress()
}

/**
 * Check if wallet is connected
 * @returns {boolean}
 */
export function isConnected() {
  if (TEST_MODE && testAccount) {
    return true  // Always connected in test mode
  }
  return modal.getIsConnected()
}

/**
 * Open the wallet connection modal
 */
export async function openModal() {
  if (TEST_MODE) {
    console.log('TEST MODE: Skipping wallet modal, using test account:', testAccount?.address)
    return
  }
  await modal.open()
}

/**
 * Get the wallet provider for signing
 * @returns {Promise<any>} The wallet provider
 */
export async function getProvider() {
  const provider = modal.getWalletProvider()
  if (!provider) {
    throw new Error('No wallet provider available')
  }
  return provider
}

/**
 * Sign a message with the connected wallet
 * @param {string} message - The message to sign
 * @returns {Promise<string>} The signature
 */
export async function signMessage(message) {
  const provider = await getProvider()
  const address = getAddress()

  if (!address) {
    throw new Error('No wallet connected')
  }

  const signature = await provider.request({
    method: 'personal_sign',
    params: [message, address]
  })

  return signature
}

/**
 * Sign typed data (EIP-712) for x402 payment
 * @param {object} typedData - The typed data to sign
 * @returns {Promise<string>} The signature
 */
export async function signTypedData(typedData) {
  // In test mode, sign directly with the private key using viem
  if (TEST_MODE && testAccount) {
    console.log('[x402] 🧪 Using viem to sign with test private key')
    try {
      const signature = await testAccount.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message
      })
      console.log('[x402] ✅ viem signTypedData successful')
      return signature
    } catch (err) {
      console.error('[x402] ❌ viem signTypedData failed:', err)
      throw err
    }
  }

  const provider = await getProvider()
  const address = getAddress()

  if (!address) {
    throw new Error('No wallet connected')
  }

  // For WalletConnect, convert BigInts to strings for JSON serialization
  const serializableTypedData = JSON.parse(JSON.stringify(typedData, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ))

  console.log('[x402] Using WalletConnect provider to sign')
  const signature = await provider.request({
    method: 'eth_signTypedData_v4',
    params: [address, JSON.stringify(serializableTypedData)]
  })

  return signature
}

/**
 * Generate a random nonce for EIP-3009
 * @returns {string} 32-byte hex nonce
 */
function generateNonce() {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  return toHex(randomBytes)
}

/**
 * Handle x402 payment flow using EIP-3009 TransferWithAuthorization
 * @param {Response} response - The 402 response from the server
 * @param {string} originalUrl - The original request URL
 * @param {object} originalOptions - The original fetch options
 * @returns {Promise<Response>} The response after payment
 */
export async function handlePaymentRequired(response, originalUrl, originalOptions) {
  console.log('%c[x402] 💳 Payment Required (402) received', 'color: #f59e0b; font-weight: bold')
  console.log('[x402] Original URL:', originalUrl)

  // In test mode, we're always "connected" with the test account
  if (TEST_MODE) {
    console.log('%c[x402] 🧪 TEST MODE active', 'color: #8b5cf6; font-weight: bold')
    console.log('[x402] Using test account:', testAccount?.address)
  }

  // Check if wallet is connected (skipped in test mode)
  if (!isConnected()) {
    console.log('[x402] Wallet not connected, opening modal...')
    await openModal()
    // Wait for connection
    await new Promise((resolve, reject) => {
      const checkConnection = setInterval(() => {
        if (isConnected()) {
          clearInterval(checkConnection)
          resolve()
        }
      }, 500)
      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(checkConnection)
        reject(new Error('Wallet connection timeout'))
      }, 60000)
    })
  }

  // Parse payment requirements from PAYMENT-REQUIRED header (x402 v2) or body (x402 v1)
  let paymentRequirements
  const paymentRequiredHeader = response.headers.get('PAYMENT-REQUIRED')

  if (paymentRequiredHeader) {
    // x402 v2: requirements in header
    try {
      paymentRequirements = JSON.parse(atob(paymentRequiredHeader))
      console.log('[x402] v2 Payment requirements from header:', paymentRequirements)
    } catch (e) {
      console.error('[x402] Failed to parse PAYMENT-REQUIRED header:', e)
      throw new Error('Invalid PAYMENT-REQUIRED header')
    }
  } else {
    // x402 v1: requirements in body
    paymentRequirements = await response.json()
    console.log('[x402] v1 Payment requirements from body:', paymentRequirements)
  }

  if (!paymentRequirements || !paymentRequirements.accepts) {
    console.error('[x402] ❌ Invalid payment requirements - missing "accepts" field')
    throw new Error('Invalid payment requirements in 402 response')
  }

  // Get the first accepted payment scheme (should be x402)
  const paymentScheme = paymentRequirements.accepts[0]
  if (!paymentScheme) {
    console.error('[x402] ❌ No accepted payment schemes found')
    throw new Error('No accepted payment schemes')
  }

  // x402 v2 uses 'amount', v1 uses 'maxAmountRequired'
  const amount = paymentScheme.amount || paymentScheme.maxAmountRequired

  console.log('[x402] Payment scheme:', paymentScheme.scheme)
  console.log('[x402] Network:', paymentScheme.network)
  console.log('[x402] Amount:', amount, '(smallest unit)')
  console.log('[x402] Pay to:', paymentScheme.payTo)
  console.log('[x402] Asset (USDC):', paymentScheme.asset)

  // Get signer address
  const fromAddress = getAddress()
  console.log('[x402] Signer (from):', fromAddress)

  // Get chain ID
  const chainId = CHAIN_IDS[paymentScheme.network]
  if (!chainId) {
    throw new Error(`Unknown network: ${paymentScheme.network}`)
  }
  console.log('[x402] Chain ID:', chainId)

  // Generate nonce and timestamps for EIP-3009
  const nonce = generateNonce()
  const validAfter = 0  // Valid immediately
  const validBefore = Math.floor(Date.now() / 1000) + paymentScheme.maxTimeoutSeconds

  console.log('[x402] Nonce:', nonce)
  console.log('[x402] Valid after:', validAfter)
  console.log('[x402] Valid before:', validBefore, `(${new Date(validBefore * 1000).toISOString()})`)

  // Construct EIP-712 typed data for TransferWithAuthorization (EIP-3009)
  const typedData = {
    domain: {
      name: paymentScheme.extra?.name || 'USDC',
      version: paymentScheme.extra?.version || '2',
      chainId: chainId,
      verifyingContract: paymentScheme.asset
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: fromAddress,
      to: paymentScheme.payTo,
      value: BigInt(amount),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce
    }
  }

  console.log('[x402] EIP-712 typed data:', {
    domain: typedData.domain,
    primaryType: typedData.primaryType,
    message: {
      ...typedData.message,
      value: typedData.message.value.toString(),
      validAfter: typedData.message.validAfter.toString(),
      validBefore: typedData.message.validBefore.toString()
    }
  })

  console.log('[x402] 🔐 Signing EIP-712 typed data...')

  // Sign the authorization using EIP-712 typed data
  const signature = await signTypedData(typedData)
  console.log('%c[x402] ✅ Signature obtained', 'color: #10b981; font-weight: bold')
  console.log('[x402] Signature:', signature.slice(0, 20) + '...' + signature.slice(-10))

  // Create the payment payload per x402 spec
  // Include full EIP-712 structure for facilitator verification
  const paymentPayload = {
    signature: signature,
    authorization: {
      from: fromAddress,
      to: paymentScheme.payTo,
      value: amount,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce: nonce
    },
    // Include EIP-712 domain for facilitator
    eip712Domain: {
      name: typedData.domain.name,
      version: typedData.domain.version,
      chainId: typedData.domain.chainId,
      verifyingContract: typedData.domain.verifyingContract
    }
  }

  // Detect x402 version from requirements
  const x402Version = paymentRequirements.x402Version || 1

  // Build payment header based on version
  let paymentHeader
  if (x402Version >= 2) {
    // x402 v2 format includes resource and accepted fields
    paymentHeader = JSON.stringify({
      x402Version: x402Version,
      resource: paymentRequirements.resource || {
        url: originalUrl,
        description: '',
        mimeType: ''
      },
      accepted: paymentScheme,
      payload: paymentPayload
    })
  } else {
    // x402 v1 format
    paymentHeader = JSON.stringify({
      x402Version: 1,
      scheme: paymentScheme.scheme,
      network: paymentScheme.network,
      payload: paymentPayload
    })
  }

  console.log('[x402] Payment header (decoded):', JSON.parse(paymentHeader))

  // Encode to base64
  const encodedPayment = btoa(paymentHeader)

  // x402 v2 uses PAYMENT-SIGNATURE, v1 uses X-PAYMENT
  const paymentHeaderName = x402Version >= 2 ? 'PAYMENT-SIGNATURE' : 'X-PAYMENT'
  console.log(`[x402] ${paymentHeaderName} header (base64):`, encodedPayment.slice(0, 50) + '...')

  // Retry the original request with payment header
  const newOptions = {
    ...originalOptions,
    headers: {
      ...originalOptions.headers,
      [paymentHeaderName]: encodedPayment
    }
  }

  console.log('%c[x402] 🚀 Retrying request with payment...', 'color: #3b82f6; font-weight: bold')
  const paidResponse = await fetch(originalUrl, newOptions)

  console.log('[x402] Response status:', paidResponse.status, paidResponse.statusText)

  // Check PAYMENT-RESPONSE (v2) or X-PAYMENT-RESPONSE (v1) header for settlement result
  const paymentResponseHeader = paidResponse.headers.get('PAYMENT-RESPONSE') ||
                                 paidResponse.headers.get('X-PAYMENT-RESPONSE')
  let settlementResult = null

  if (paymentResponseHeader) {
    try {
      settlementResult = JSON.parse(atob(paymentResponseHeader))
      console.log('[x402] Settlement result:', settlementResult)
    } catch (e) {
      console.warn('[x402] Could not parse payment response header:', e)
    }
  }

  if (paidResponse.ok) {
    // Check if settlement actually succeeded
    if (settlementResult?.success && settlementResult?.transaction) {
      console.log('%c[x402] ✅ Payment settled on-chain!', 'color: #10b981; font-weight: bold; font-size: 14px')
      // Support both CAIP-2 format (eip155:84532) and legacy format (base-sepolia)
      const isTestnet = paymentScheme.network === 'base-sepolia' ||
                        paymentScheme.network === 'eip155:84532'
      const explorerUrl = isTestnet
        ? `https://sepolia.basescan.org/tx/${settlementResult.transaction}`
        : `https://basescan.org/tx/${settlementResult.transaction}`
      console.log('%c[x402] 🔗 View on BaseScan:', 'color: #3b82f6; font-weight: bold; font-size: 12px')
      console.log(explorerUrl)  // Standalone URL is clickable in DevTools
      console.log('[x402] Transaction hash:', settlementResult.transaction)
      console.log('[x402] Payer:', settlementResult.payer)
      console.log('[x402] Network:', settlementResult.network)
    } else if (settlementResult?.success === false) {
      console.warn('%c[x402] ⚠️ Request succeeded but settlement FAILED', 'color: #f59e0b; font-weight: bold')
      console.warn('[x402] Settlement error:', settlementResult.error)
      console.warn('[x402] The service was provided but payment was NOT collected!')
    } else {
      console.log('%c[x402] ✅ Request accepted', 'color: #10b981; font-weight: bold')
      console.log('[x402] No settlement info in response')
      // Log all headers for debugging
      console.log('[x402] All response headers:')
      paidResponse.headers.forEach((value, key) => {
        console.log(`  ${key}: ${value}`)
      })
    }
  } else {
    console.error('%c[x402] ❌ Payment failed', 'color: #ef4444; font-weight: bold')
    const errorText = await paidResponse.clone().text()
    console.error('[x402] Error response:', errorText)
  }

  return paidResponse
}

/**
 * Fetch wrapper that handles x402 payments automatically
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function fetchWithPayment(url, options = {}) {
  console.log('%c[x402] 📡 fetchWithPayment', 'color: #6366f1; font-weight: bold')
  console.log('[x402] URL:', url)
  console.log('[x402] Method:', options.method || 'GET')
  if (options.body) {
    try {
      console.log('[x402] Body:', JSON.parse(options.body))
    } catch {
      console.log('[x402] Body:', options.body)
    }
  }

  const response = await fetch(url, options)
  console.log('[x402] Initial response:', response.status, response.statusText)

  if (response.status === 402) {
    console.log('%c[x402] 💰 402 detected - initiating payment flow', 'color: #f59e0b; font-weight: bold')
    return handlePaymentRequired(response, url, options)
  }

  if (response.ok) {
    console.log('%c[x402] ✅ Request successful (no payment needed)', 'color: #10b981')
  }

  return response
}

// Export modal for direct access if needed
export { modal, wagmiAdapter }
