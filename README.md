# Aviation Quality Control App

This is a comprehensive React Native application designed for quality control processes in the aviation industry. It enables users to capture, annotate, and manage photos of aviation parts, streamlining the quality control workflow. The app is built with Expo and leverages a robust stack of modern technologies to provide a seamless and efficient user experience, including offline capabilities and data synchronization.

## Features

- **User Authentication**: Secure user login and sign-up functionality handled by Supabase.
- **Photo & Batch Management**: 
    - Capture high-quality photos of aviation parts.
    - Group photos into batches, associating them with specific work orders or inventory items.
    - Track the status of each batch (e.g., in-progress, completed, synced).
- **Image Annotation**: 
    - Annotate images with text and drawings to highlight defects or points of interest.
    - A dedicated screen for highlighting defects on photos.
- **Offline-First Functionality**: 
    - All data, including images and annotations, is stored locally in an SQLite database.
    - The app remains fully functional without an active internet connection.
- **Data Synchronization**: 
    - Automatically syncs local data with the backend when a network connection is available.
    - A sync status indicator provides real-time feedback on the synchronization process.
- **ERP & Salesforce Integration**: 
    - Features for interacting with ERP systems and Salesforce, facilitating seamless data flow between the app and other business systems.
- **PDF Report Generation**: 
    - Generate and share PDF reports of photo batches, complete with images and annotations.
- **Analytics**: 
    - In-app analytics to track user engagement and application performance.
- **User-Friendly Interface**: 
    - A clean and intuitive UI built with React Native Paper and custom components.
    - Includes a dashboard for a quick overview of recent activity and statistics.

## Tech Stack

- **Framework**: React Native with Expo
- **Language**: TypeScript
- **UI**: React Native Paper, custom-built components
- **Navigation**: React Navigation (Stack and Tab navigators)
- **Backend-as-a-Service (BaaS)**: Supabase for authentication and database
- **Local Database**: Expo-SQLite for offline storage
- **State Management**: React Context API for managing authentication and synchronization state
- **Image Handling**: Expo Camera, Expo Image Manipulator

## Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- Expo CLI
- An account with Supabase for the backend setup.

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd AviationQualityControlApp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   - Create a `.env` file in the root of the project.
   - Add the necessary environment variables as listed in the `.env.example` file.

   ```
   EXPO_PUBLIC_SUPABASE_URL="your_supabase_url"
   EXPO_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
   SALESFORCE_LOGIN_URL="your_salesforce_login_url"
   SALESFORCE_CLIENT_ID="your_salesforce_client_id"
   SALESFORCE_CLIENT_SECRET="your_salesforce_client_secret"
   SALESFORCE_USERNAME="your_salesforce_username"
   SALESFORCE_PASSWORD="your_salesforce_password"
   ```

### Available Scripts

- **`npm start`**: Starts the Expo development server.
- **`npm run android`**: Builds and runs the app on an Android emulator or connected device.
- **`npm run ios`**: Builds and runs the app on an iOS simulator or connected device.
- **`npm run web`**: Runs the app in a web browser.

## Project Structure

The project is organized into the following main directories:

- **`src/`**: Contains the core source code of the application.
  - **`components/`**: Reusable UI components (e.g., buttons, inputs, modals).
  - **`contexts/`**: React context providers for managing global state (e.g., `AuthContext`, `SyncContext`).
  - **`hooks/`**: Custom React hooks for shared logic.
  - **`lib/`**: Library configurations, such as the Supabase client.
  - **`navigation/`**: Navigation setup using React Navigation.
  - **`screens/`**: The different screens of the application.
  - **`services/`**: Services for handling business logic (e.g., `authService`, `databaseService`, `syncService`).
  - **`styles/`**: Global styles, theme, and design tokens.
  - **`types/`**: TypeScript type definitions.
  - **`utils/`**: Utility functions and helper modules.
- **`assets/`**: Static assets like images, fonts, and icons.
- **`android/`** and **`ios/`**: Native project files for Android and iOS.

## Key Services and Functionality

- **`authService.ts`**: Manages user authentication, including login, sign-up, and session management with Supabase.
- **`databaseService.ts`**: Handles all interactions with the local SQLite database, including creating, reading, updating, and deleting data.
- **`syncService.ts`**: Manages the synchronization of local data with the backend.
- **`salesforceService.ts`**: Contains logic for interacting with the Salesforce API.
- **`erpService.ts`**: Manages interactions with the ERP system.
- **`networkService.ts`**: Monitors the device's network status to enable or disable online features.

## Environment Variables

The application requires the following environment variables to be set in a `.env` file:

- **`EXPO_PUBLIC_SUPABASE_URL`**: The URL of your Supabase project.
- **`EXPO_PUBLIC_SUPABASE_ANON_KEY`**: The anonymous key for your Supabase project.
- **`SALESFORCE_LOGIN_URL`**: The login URL for your Salesforce instance.
- **`SALESFORCE_CLIENT_ID`**: The client ID for your Salesforce connected app.
- **`SALESFORCE_CLIENT_SECRET`**: The client secret for your Salesforce connected app.
- **`SALESFORCE_USERNAME`**: The username for your Salesforce account.
- **`SALESFORCE_PASSWORD`**: The password for your Salesforce account.

**Note**: For variables to be accessible in the client-side code, they must be prefixed with `EXPO_PUBLIC_`.

## Contributing

Contributions are welcome! Please follow the standard fork-and-pull-request workflow.

---
This `README.md` provides a comprehensive overview of the Aviation Quality Control App, its features, and the technologies used. It is intended to help new developers understand the codebase and get started with development quickly.
