import { getAuth, signInWithCredential, signOut, GoogleAuthProvider } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Alert } from 'react-native';

/**
 * Configure Google Sign-In with Web Client ID from Firebase Console
 * (Project ID: hisab-kitab-5480c)
 */
export const configureGoogleSignIn = (webClientId: string) => {
  GoogleSignin.configure({
    webClientId,
    offlineAccess: true,
  });
};

/**
 * Perform Google Sign-In & authenticate with Firebase Auth
 */
export const signInWithGoogle = async (webClientId?: string) => {
  try {
    if (webClientId) {
      configureGoogleSignIn(webClientId);
    }

    // 1. Check Play Services availability
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // 2. Trigger native account picker prompt
    const response = await GoogleSignin.signIn();
    
    // Extract ID token from Google Sign-In response
    const idToken = response.data?.idToken;
    if (!idToken) {
      throw new Error('Google Sign-In failed: No ID token returned.');
    }

    // 3. Create Firebase credential
    const googleCredential = GoogleAuthProvider.credential(idToken);

    // 4. Authenticate with Firebase Auth
    const authInstance = getAuth();
    const userCredential = await signInWithCredential(authInstance, googleCredential);
    return userCredential.user;
  } catch (error: any) {
    console.error('[HisabKitab Firebase Auth Error]:', error);
    Alert.alert('Sign-In Error', error.message || 'Failed to sign in with Google');
    throw error;
  }
};

/**
 * Sign out current user from Firebase & Google
 */
export const signOutUser = async () => {
  try {
    await GoogleSignin.signOut();
    const authInstance = getAuth();
    await signOut(authInstance);
  } catch (error) {
    console.error('[HisabKitab SignOut Error]:', error);
  }
};
