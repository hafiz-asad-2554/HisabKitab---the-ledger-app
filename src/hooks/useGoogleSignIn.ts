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
 * ─── OAuth Error 400 Remediation Checklist ───────────────────────────────────
 *
 * The "Error 400: redirect_uri_mismatch" or "access_blocked" error is caused
 * by a mismatch between what the app sends to Google and what is registered.
 *
 * 1. REDIRECT URI — In Google Cloud Console → Credentials → your Web OAuth 2.0
 *    Client ID → "Authorised redirect URIs", add BOTH:
 *      • https://auth.expo.io/@hafiz-asad-2554/hisabkitab  (Expo proxy, used in Expo Go)
 *      • hisabkitab://auth  (custom scheme, used in bare/standalone builds)
 *    The URI logged in the console output below is the exact value sent at runtime.
 *
 * 2. PACKAGE NAME & SHA-1 FINGERPRINTS — Firebase Console → Project Settings
 *    → Android app (com.hisabkitab.app) → Add fingerprint:
 *      • Debug: run `cd android && ./gradlew signingReport` → copy SHA-1 under
 *        the "debug" variant.
 *      • Release / EAS: run `eas credentials` → copy the SHA-1 fingerprint.
 *    Without the correct SHA-1 registered, Android-type OAuth clients won't work.
 *
 * 3. OAUTH CONSENT SCREEN — Cloud Console → APIs & Services → OAuth consent screen:
 *      • If publishing status is "Testing", add the signing-in account under
 *        "Test users". Use the plain email format: asadrao000@gmail.com
 *        (NOT a URL prefix — that will fail validation).
 *      • Scopes listed in the consent screen must include:
 *          openid, profile, email, https://www.googleapis.com/auth/drive.file
 *
 * 4. FIREBASE AUTH — Firebase Console → Authentication → Sign-in method:
 *      • Google must be enabled.
 *      • "Web SDK configuration" → Web client ID must match
 *        836368558078-07em0u27t9ijf9u29c9i0lt1ptiick5u.apps.googleusercontent.com
 *        and the client secret must be filled in.
 *
 * 5. AFTER CHANGES — wait ~5 minutes for propagation, then re-test on both a
 *    debug build and a release/EAS build.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Implementation notes:
 * - Uses ResponseType.Code + PKCE (usePKCE: true) which is more secure and
 *   correctly supported by expo-auth-session on Android standalone builds.
 * - ResponseType.Token (implicit) is deprecated by Google and causes 400 on
 *   some Android configurations.
 * - The redirect URI is logged at startup so you can copy-paste it into the
 *   Cloud Console without guessing.
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
  // Note: ResponseType.Code with PKCE is required for mobile clients on Google OAuth 2.0
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
      responseType: ResponseType.Code,
      usePKCE: true,
    },
    discovery
  );

  useEffect(() => {
    if (!response) return;

    if (response.type === 'error') {
      // Log full error payload so redirect_uri_mismatch / access_blocked details are visible
      const errCode = response.error?.code ?? 'unknown';
      const errMsg = response.error?.message ?? 'Authentication failed';
      console.error('[HisabKitab OAuth] Error response:', JSON.stringify(response.error));
      console.error('[HisabKitab OAuth] Redirect URI that was used:', redirectUri);
      setError(`OAuth Error (${errCode}): ${errMsg}`);
      setLoading(false);
      return;
    }

    if (response.type === 'dismiss') {
      setLoading(false);
      return;
    }

    // Code flow: exchange authorization code for tokens via expo-auth-session
    // (request.codeVerifier is populated automatically when usePKCE: true)
    const authCode = response.type === 'success' ? response.params?.code : null;
    const token = response.type === 'success' ? response.authentication?.accessToken : null;

    // expo-auth-session may resolve the token exchange internally (via its built-in
    // token endpoint call) — if so, accessToken is available directly.
    const resolvedToken = token ?? null;
    if (!authCode && !resolvedToken) return;

    setLoading(true);
    setError(null);

    const proceed = (accessTok: string) => {
      // Store the token for both general and Drive use
      Promise.all([
        SecureStore.setItemAsync('googleAccessToken', accessTok),
        secureCredentials.setDriveToken(accessTok),
      ]).catch(console.error);

      setAccessToken(accessTok);

      // Fetch the user's basic profile information
      fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessTok}` },
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
          console.error('[HisabKitab OAuth] Profile fetch failed:', err);
          setError(err instanceof Error ? err.message : 'Profile fetch failed');
        })
        .finally(() => setLoading(false));
    };

    if (resolvedToken) {
      // Token already resolved by expo-auth-session's built-in exchange
      proceed(resolvedToken);
    } else if (authCode && request?.codeVerifier) {
      // Manual PKCE exchange (fallback if expo-auth-session doesn't auto-exchange)
      fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: [
          `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}`,
          `redirect_uri=${encodeURIComponent(redirectUri)}`,
          `code=${encodeURIComponent(authCode)}`,
          `code_verifier=${encodeURIComponent(request.codeVerifier)}`,
          'grant_type=authorization_code',
        ].join('&'),
      })
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(`Token exchange: ${data.error_description ?? data.error}`);
          if (data.access_token) proceed(data.access_token);
        })
        .catch(err => {
          console.error('[HisabKitab OAuth] Token exchange failed:', err);
          setError(err instanceof Error ? err.message : 'Token exchange failed');
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [response]);

  const signOut = useCallback(async () => {
    setAccessToken(null);
    await SecureStore.deleteItemAsync('googleAccessToken');
    await secureCredentials.clearDriveToken();
  }, []);

  const isSignedIn = Boolean(accessToken);

  return { promptAsync, loading, request, error, signOut, isSignedIn, accessToken };
};
