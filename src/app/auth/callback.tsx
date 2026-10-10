import { Redirect } from 'expo-router';

/** Landing spot for auth redirects (dobetter://auth/callback). The Gate routes from here. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
