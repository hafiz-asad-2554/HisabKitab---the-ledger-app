import * as SecureStore from 'expo-secure-store';
import { useEffect, useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, ResponseType } from 'expo-auth-session';
import Constants from 'expo-constants';
import { useAppStore } from '../store';
import { secureCredentials } from '../services/secure-credentials';

// Ensure the auth session can be completed when the app is opened from a redirect.
WebBrowser.maybeCompleteAuthSession();

// Discovery document for Google OAuth
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/**
 * Google Client ID – resolves from environment variable, Constants manifest extra,
 * or falls back to the configured Firebase Web Client ID from google-services.json.
 */
const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  Constants.expoConfig?.extra?.googleClientId ||
  '836368558078-07em0u27t9ijf9u29c9i0lt1ptiick5u.apps.googleusercontent.com';

/**
 * Hook that initiates Google OAuth flow using expo-auth-session.
 *
 * OAuth Fix Notes:
 * - Dynamically loads Client ID to prevent invalid_client 400 errors
 * - Uses `scheme` redirect for bare / standalone Expo builds
 * - Includes Google Drive file scope for sync functionality
 * - Stores both access token in SecureStore and updates the Drive credentials
 */
export const useGoogleSignIn = () => {
  const updateProfile = useAppStore(state => state.updateProfile);
  const profile = useAppStore(state => state.profile);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build the redirect URI
  const redirectUri = makeRedirectUri({
    scheme: 'hisabkitab',
    path: 'auth',
  });

  // Configure the OAuth request with Drive scope
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri,
      scopes: [
        'openid',
        'profile',
        'email',
        'https://www.googleapis.com/auth/drive.file',
      ],
      responseType: ResponseType.Token,
      usePKCE: false,
    },
    discovery
  );

  useEffect(() => {
    if (!response) return;

    if (response.type === 'error') {
      setError(response.error?.message ?? 'Authentication failed');
      setLoading(false);
      return;
    }

    if (response.type === 'dismiss') {
      setLoading(false);
      return;
    }

    const token = response.type === 'success' ? response.authentication?.accessToken : null;
    if (!token) return;

    setLoading(true);
    setError(null);

    // Store the token for both general and Drive use
    Promise.all([
      SecureStore.setItemAsync('googleAccessToken', token),
      secureCredentials.setDriveToken(token),
    ]).catch(console.error);

    setAccessToken(token);

    // Fetch the user's basic profile information
    fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`);
        return res.json();
      })
      .then(user => {
        const updatedProfile = {
          name: user.name ?? profile.name ?? '',
          email: user.email ?? profile.email ?? '',
          avatarUri: user.picture ?? profile.avatarUri ?? undefined,
        };
        updateProfile(updatedProfile);
      })
      .catch(err => {
        console.error('Google sign‑in profile fetch failed', err);
        setError(err instanceof Error ? err.message : 'Profile fetch failed');
      })
      .finally(() => setLoading(false));
  }, [response]);

  const signOut = useCallback(async () => {
    setAccessToken(null);
    await SecureStore.deleteItemAsync('googleAccessToken');
    await secureCredentials.clearDriveToken();
  }, []);

  const isSignedIn = Boolean(accessToken);

  return { promptAsync, loading, request, error, signOut, isSignedIn, accessToken };
};
