import * as SecureStore from 'expo-secure-store';

const DRIVE_TOKEN_KEY = 'hisabkitab.drive.access-token';
export const secureCredentials = {
  getDriveToken: () => SecureStore.getItemAsync(DRIVE_TOKEN_KEY),
  setDriveToken: (token: string) => SecureStore.setItemAsync(DRIVE_TOKEN_KEY, token),
  clearDriveToken: () => SecureStore.deleteItemAsync(DRIVE_TOKEN_KEY),
};
