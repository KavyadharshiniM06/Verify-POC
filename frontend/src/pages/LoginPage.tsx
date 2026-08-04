/**
 * LoginPage — root redirect
 *
 * / → /admin   (HR Admin Portal, dark theme)
 * / → /analyst (Credit Analyst Portal, light theme) — navigate there directly
 */
import { Navigate } from 'react-router-dom'

export default function LoginPage() {
  return <Navigate to="/admin" replace />
}
