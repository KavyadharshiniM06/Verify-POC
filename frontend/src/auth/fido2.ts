import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import api from '../api/axios'

export interface AuthResult {
  token: string
  user: { name: string; email: string }
}

/**
 * Register a new passkey with IBM Verify via the backend.
 * @param verifyUserId  The IBM Verify user ID (sub claim or directory ID)
 * @param username      Username for display
 * @param displayName   Full name for display
 * @param email         User email
 */
export async function registerPasskey(
  verifyUserId: string,
  username: string,
  displayName: string,
  email: string
): Promise<AuthResult> {
  // 1. Get registration options from backend (which fetches from IBM Verify)
  const { data: options } = await api.post('/auth/fido2/register/begin', {
    verify_user_id: verifyUserId,
    username,
    display_name: displayName,
  })

  // 2. Invoke browser WebAuthn API — triggers Face ID / Touch ID / fingerprint
  const attestationResponse = await startRegistration({ optionsJSON: options })

  // 3. Send attestation to backend for IBM Verify verification
  const { data: result } = await api.post('/auth/fido2/register/complete', {
    verify_user_id: verifyUserId,
    email,
    name: displayName,
    attestation_response: attestationResponse,
  })

  return result
}

/**
 * Authenticate with an existing passkey.
 * @param verifyUserId  The IBM Verify user ID
 */
export async function loginWithPasskey(verifyUserId: string): Promise<AuthResult> {
  // 1. Get assertion options (challenge) from backend
  const { data: options } = await api.post('/auth/fido2/login/begin', {
    verify_user_id: verifyUserId,
  })

  // 2. Browser invokes biometric — Face ID fires here
  const assertionResponse = await startAuthentication({ optionsJSON: options })

  // 3. Send assertion to backend for IBM Verify verification
  const { data: result } = await api.post('/auth/fido2/login/complete', {
    verify_user_id: verifyUserId,
    assertion_response: assertionResponse,
  })

  return result
}
