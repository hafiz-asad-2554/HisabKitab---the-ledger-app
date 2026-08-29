# HisabKitab — Local-First Financial Ecosystem 📒

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React Native](https://img.shields.io/badge/React_Native-0.86.2-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-57.0.16-000000?logo=expo&logoColor=white)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Schema_v1.0.0-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)

**HisabKitab** is a comprehensive, offline-first personal financial ecosystem and digital khata ledger designed for mobile platforms (**Android & iOS**). It empowers individuals, shopkeepers, farmers, and project managers to maintain transparent, auditor-ready records across four distinct financial pillars.

---

## 🌟 The 4 Core Financial Pillars

HisabKitab organizes financial management into four specialized pillars, accessible via a global **Pill Context Switcher**:

### 1. 🏠 Home & Family Ledger (Personal Khata)
- Track personal debts (*Udhar*) and credits (*Jama*) per contact.
- Seamless contact import and linking with device address book (`expo-contacts`).
- Visual balance color-coding: **Emerald Green** for receivables (*Lena Hai*) and **Crimson Red** for payables (*Dena Hai*).

### 2. 🌾 Agriculture & Farm Management
- Track individual crop cycles (e.g., Wheat 2026, Rice 2026) with acreage tracking.
- Record categorized crop expenses (*Seeds, Water, Spray, Harvest, Transport*) and yield revenue.
- Real-time Profit & Loss (P&L) calculation per crop cycle.

### 3. 🏪 Business & Shop Ledger (Khata Module)
- Manage customer and supplier credit/debit balances in real time.
- Log sales, purchases, returns, COGS, cash-in, and cash-out transactions.
- Automated Net Profit analytics computed via:
  $$\text{Net Profit} = \sum(\text{Revenue}) - \left(\sum(\text{Expenses}) + \text{COGS}\right)$$

### 4. 👛 Lump-Sum Task-Based Capital Tracker
- Setup dedicated capital pools for large-scale projects (e.g., tracking a 4,000,000 PKR house construction or shop renovation).
- Log itemized purchase entries capturing item name, quantity, unit price, total cost, vendor name, payment method (*Cash, Bank, Credit*), and purchase date.
- Strict input validation enforcing $\text{Total Cost} = \text{Quantity} \times \text{Unit Price}$.
- Live threshold warning alerts when pool expenditure reaches or exceeds **80% of total budget**.

---

## 🛠️ Tech Stack & System Architecture

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Core Framework** | React Native `0.86.2` & Expo `~57.0.16` | Cross-platform native mobile application |
| **Routing** | Expo Router `~57.0.16` | File-based typed routing (`src/app/`) |
| **State & Storage** | Zustand `^4.5.2` + AsyncStorage | Persistent local-first state engine |
| **Database Schema** | `expo-sqlite` DDL Architecture | Relational DDL schema (`src/db/schema.sql`) |
| **Cloud Sync** | Google Drive REST API v3 | Non-custodial backup & multi-device delta sync |
| **Native Auth** | Android Credential Manager | `LoginActivity.kt` for native Google Sign-In & Firebase Auth |
| **Security** | `expo-local-authentication` & `expo-secure-store` | Hardware biometric lock & encrypted token storage |
| **Language** | TypeScript `~6.0.3` | Strict type-safety across all modules |

---

## 📂 Project Structure

```
HisabKitab/
├── android/                   # Native Android build & Credential Manager configuration
│   └── app/src/main/java/com/hisabkitab/app/
│       ├── MainActivity.kt    # Root Android Activity
│       └── LoginActivity.kt   # Custom Android Credential Manager native auth flow
├── assets/                    # Application icons, logos, and static assets
├── scripts/                   # Workspace utility scripts
├── src/                       # Application Source Code
│   ├── app/                   # Expo Router File-Based Navigation
│   │   ├── _layout.tsx        # Root Stack Navigator & Biometric Lock Gate
│   │   ├── notifications.tsx  # Notification & sharing approval center
│   │   ├── profile.tsx        # User profile & Drive sync management
│   │   ├── (tabs)/            # Main Tab Navigation
│   │   │   ├── _layout.tsx    # Tab bar definitions
│   │   │   ├── index.tsx      # Home (Personal Khata Directory)
│   │   │   ├── crops.tsx      # Agriculture & Farm Management
│   │   │   ├── business.tsx   # Business Ledger & Party Khata
│   │   │   ├── capital.tsx    # Lump-Sum Capital Project Pools
│   │   │   ├── share.tsx      # Multi-user Ledger Sharing Hub
│   │   │   ├── reports.tsx    # PDF & Excel Statement Export
│   │   │   └── more.tsx       # App Settings & Lock Toggles
│   │   ├── person/[id].tsx    # Individual Personal Contact Ledger
│   │   ├── crop/[id].tsx      # Individual Crop Cycle Ledger
│   │   ├── business/[partyId].tsx # Individual Business Party Khata
│   │   └── capital/[poolId].tsx   # Capital Pool Itemized Expense Dashboard
│   ├── components/            # Shared UI Components
│   │   ├── app-lock-gate.tsx  # Biometric / PIN App Lock Gate
│   │   └── ContextSwitcher.tsx# Multi-Context Pillar Switcher Bar
│   ├── db/                    # Database Architecture
│   │   └── schema.sql         # PRD v1.0.0 SQLite DDL Scripts & Indexes
│   ├── hooks/                 # Custom React & Analytics Hooks
│   │   ├── useBusinessLedger.ts # Business P&L Analytics calculations
│   │   ├── useCapitalPool.ts    # Capital Pool Budget & 80% warning calculations
│   │   └── useGoogleSignIn.ts   # OAuth 2.0 lifecycle management
│   ├── services/              # Device integration & secure storage services
│   ├── store/                 # State management stores
│   │   ├── index.ts           # App Store (Contacts, Crops, Sync, Tombstones)
│   │   ├── businessStore.ts   # Business Parties & Transactions Store
│   │   └── capitalStore.ts    # Capital Pools & Expenses Store
│   ├── sync/                  # Background Drive Auto-Sync lifecycle listeners
│   ├── theme.ts               # PRD Color Palette & Design Tokens
│   └── utils/                 # PDF (expo-print) & Excel (xlsx) exporters
├── app.json                   # Expo App Configuration Manifest
├── eas.json                   # EAS Cloud Build Profiles (Preview & Production)
├── package.json               # Project Dependencies & Build Scripts
├── tsconfig.json              # TypeScript Strict Configuration
└── README.md                  # Project Documentation
```

---

## ⚡ Installation & Local Development Setup

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **Package Manager**: `npm` (comes with Node.js)
- **Expo CLI**: `npm install -g eas-cli`

### Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/hafiz-asad-2554/HisabKitab---the-ledger-app.git
   cd HisabKitab---the-ledger-app
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Type Verification**:
   ```bash
   npx tsc --noEmit
   ```

4. **Start Expo Development Server**:
   ```bash
   npm start
   # or
   npx expo start
   ```

5. **Run on Android / iOS**:
   - Press `a` in the terminal to launch on connected Android Device/Emulator.
   - Press `i` to launch on iOS Simulator.
   - Scan the QR code with **Expo Go** on physical devices.

---

## 📱 Build & Deployment Guide (EAS Build)

### 1. Local Android Native Build
To compile local native Android binaries with the native Credential Manager support:
```bash
npx expo run:android
```

### 2. EAS Cloud APK Generation (Preview Profile)
```bash
eas build -p android --profile preview
```

### 3. Production Play Store Build (AAB)
```bash
eas build -p android --profile production
```

---

## 🛡️ Comprehensive Audit Report

### 🔴 Critical Findings
1. **Fallback Web Client ID in Native Android Activity**:
   - *Location*: `android/app/src/main/java/com/hisabkitab/app/LoginActivity.kt`
   - *Issue*: A fallback OAuth Web Client ID string (`836368558078-...apps.googleusercontent.com`) is compiled into code.
   - *Remediation*: Ensure production builds inject the Client ID dynamically via `res/values/strings.xml` generated by `google-services.json`.

2. **Unencrypted AsyncStorage Persistence**:
   - *Location*: `src/store/*.ts`
   - *Issue*: Financial entries are saved in unencrypted local storage. While hardware biometric lock prevents app UI access, rooted devices could inspect local files.
   - *Remediation*: For highly sensitive fields, utilize `expo-secure-store` or SQLCipher key wrapping.

### 🟡 Warning Findings
1. **Unsanitized Input Whitespace**:
   - *Location*: Form Modals in `index.tsx`, `business.tsx`, `capital.tsx`.
   - *Status*: Fixed in v1.0.0 via `.trim()` checks and `Number.isFinite()` budget parsing before insertion.

2. **Async Export Error Handling**:
   - *Location*: `src/app/(tabs)/reports.tsx`
   - *Status*: Fixed in v1.0.0 via `try...catch` blocks wrapping `exportFullLedgerPDF` and `exportLedgerXLSX`.

### 🟢 Optimizations Applied
- **FlatList Memoization**: Wrapped party and transaction list items in `React.memo` to optimize re-renders.
- **De-bloated Dependencies**: Purged unused starter template packages (`@expo/ui`, `expo-glass-effect`, `expo-symbols`) from `package.json`.

---

## 📄 License & Terms

Distributed under the **MIT License**. See `LICENSE` for details.

```
Copyright (c) 2026 Hafiz Muhammad Asad Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction parties...
```

---

## 👤 Author & Maintainer

**Hafiz Muhammad Asad Mustafa**
- **GitHub**: [@hafiz-asad-2554](https://github.com/hafiz-asad-2554)
- **Repository**: [HisabKitab - The Ledger App](https://github.com/hafiz-asad-2554/HisabKitab---the-ledger-app)
