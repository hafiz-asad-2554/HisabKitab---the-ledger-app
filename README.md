# HisabKitab — The Ledger App 📒

A modern, offline-first personal ledger and farm expense management app built with **React Native** and **Expo**.

Track who owes you and who you owe — effortlessly! HisabKitab is your digital khata for managing personal ledgers, farm expenses, and daily transactions. Features offline storage, cloud backup via Google Drive, biometric security, and beautiful reports.

---

## ✨ Features

- **Person-wise Ledger** — Add contacts (or import from phone) and track given/taken amounts with full transaction history.
- **Crop & Farm Management** — Track expenses and income per crop with categorized records (Seeds, Water, Spray, Harvest, Transport, etc.).
- **Signless Visual Hierarchy** — Amounts are displayed using color coding instead of confusing +/− signs for instant clarity.
- **Google Drive Backup & Restore** — Sync your entire ledger to a private Google Drive folder and restore on any device.
- **Biometric App Lock** — Secure the app with fingerprint or face authentication.
- **Export & Share** — Export individual ledger reports as shareable text summaries.
- **Multi-language Ready** — Architecture supports English, Urdu, and Hindi.
- **Offline-First** — All data is stored locally using AsyncStorage. Works without internet.
- **Dark Mode** — A premium dark theme throughout the app.

---

## 🛠️ Tech Stack

| Layer            | Technology                                      |
| ---------------- | ----------------------------------------------- |
| Framework        | React Native + Expo (SDK 57)                    |
| Routing          | Expo Router (file-based)                        |
| State Management | Zustand (with persist middleware + AsyncStorage) |
| Authentication   | expo-auth-session (Google OAuth 2.0)            |
| Cloud Sync       | Google Drive REST API v3                        |
| Security         | expo-secure-store, expo-local-authentication    |
| Language         | TypeScript                                      |

---

## 📁 Project Structure

```
khata_app/
├── app.json                  # Expo app configuration
├── eas.json                  # EAS Build profiles (APK & AAB)
├── package.json              # Dependencies & scripts
├── tsconfig.json             # TypeScript configuration
├── metro.config.js           # Metro bundler config
├── index.js                  # App entry point
├── assets/
│   └── images/               # App icons, splash, favicon
└── src/
    ├── app/                  # Screens (Expo Router file-based routing)
    │   ├── _layout.tsx       # Root layout
    │   ├── profile.tsx       # User profile & settings
    │   ├── (tabs)/           # Tab navigator
    │   │   ├── index.tsx     # Home (contacts ledger)
    │   │   ├── crops.tsx     # Crop management
    │   │   ├── reports.tsx   # Reports & analytics
    │   │   ├── share.tsx     # Share Hub (Google Drive sync)
    │   │   └── more.tsx      # Settings & more
    │   ├── person/[id].tsx   # Individual contact ledger
    │   └── crop/[id].tsx     # Individual crop details
    ├── components/           # Reusable UI components
    ├── hooks/                # Custom hooks (Google Sign-In, etc.)
    ├── services/             # Secure credential management
    ├── store/                # Zustand global state (contacts, crops, sync)
    ├── sync/                 # Cloud synchronization logic
    ├── utils/                # Google Drive API, export, import helpers
    └── theme.ts              # App-wide color palette & design tokens
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ installed
- **Expo CLI** (`npm install -g expo-cli`)
- An Android/iOS device or emulator

### Installation

```bash
# Clone the repository
git clone https://github.com/hafiz-asad-2554/HisabKitab---the-ledger-app.git
cd HisabKitab---the-ledger-app

# Install dependencies
npm install

# Start the development server
npx expo start
```

Scan the QR code with **Expo Go** on your phone, or press `a` to open in an Android emulator.

### Build APK

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build APK (cloud build)
eas build -p android --profile preview
```

---

## ⚙️ Configuration

### Google OAuth (Optional)
To enable Google Sign-In and Drive sync:
1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Drive API**.
3. Create an **OAuth 2.0 Client ID** (Web application type).
4. Replace `<YOUR_GOOGLE_CLIENT_ID>` in `src/hooks/useGoogleSignIn.ts` with your client ID.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Hafiz Muhammad Asad Mustafa**

- GitHub: [@hafiz-asad-2554](https://github.com/hafiz-asad-2554)
