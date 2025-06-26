# PRD: Login Screen Redesign

## 1. Introduction/Overview

This document outlines the requirements for redesigning the user login screen. The current login screen is functional but lacks modern UI/UX conventions. The goal is to enhance the visual appeal, improve the user experience, and modernize the interface to align with current app design standards, making it feel more professional and intuitive for warehouse workers.

## 2. Goals

*   **Improve Visual Appeal:** Update the UI to look more modern, clean, and professional.
*   **Enhance User Experience:** Introduce features that make the login process smoother, such as a password visibility toggle.
*   **Modernize Components:** Replace basic React Native components with more advanced, feature-rich components from `react-native-paper`.
*   **Maintain Consistency:** Ensure the login screen's design is consistent with other updated screens, like the sign-up screen.

## 3. User Stories

*   As a warehouse worker, I want a login screen that is clear and easy to navigate so I can sign in to the app quickly and without confusion.
*   As a user, I want to be able to see the password I am typing so I can avoid errors and log in faster.

## 4. Functional Requirements

1.  The login form shall use `TextInput` components from the `react-native-paper` library for both the email/username and password fields.
2.  The `TextInput` fields must be styled using the "outlined" mode for a modern appearance.
3.  The username/email field shall include a leading icon (e.g., an "account" or "email" icon).
4.  The password field shall include a leading icon (e.g., a "lock" icon).
5.  The password field must include a trailing "eye" icon that toggles the visibility of the password text when pressed.
6.  The primary "Login" call-to-action shall be a `Button` component from `react-native-paper`.
7.  The app title "Quality Control PIC" on the screen shall be stylized for better visual impact.
8.  The screen must retain the link or button that navigates the user to the "Sign Up" screen.
9.  The screen must continue to display activity indicators and error messages from the `AuthContext` during the login process.

## 5. Non-Goals (Out of Scope)

*   This project will **not** change the existing authentication logic or the `useAuth` hook's functionality.
*   This project will **not** introduce any new color schemes or branding elements. All styling will use the existing `theme.ts` file.
*   This project will **not** alter the navigation flow of the application beyond the login screen.

## 6. Design Considerations

*   The redesign will heavily leverage the `react-native-paper` library to ensure a modern, Material Design-inspired look.
*   The layout should remain clean and centered, prioritizing ease of use for the target user.
*   The existing `Logo` component will be used, but the title text below it will be given more prominence through styling (e.g., font weight, size).

## 7. Technical Considerations

*   The implementation will be done in the `src/screens/LoginScreen.tsx` file.
*   Dependencies on `react-native-paper` and `react-native-vector-icons` (for the input field icons) must be properly handled.
*   The component will continue to consume the `login`, `isLoading`, and `authError` properties from the `AuthContext`.

## 8. Success Metrics

*   The login screen successfully uses `react-native-paper` components for inputs and buttons.
*   The password visibility toggle is fully functional.
*   The overall look and feel of the screen is noticeably more modern and professional, aligning with the `SignUpScreen`.
*   All existing functionality (login, navigation to sign-up, error display) remains intact.

## 9. Open Questions

*   None at this time.
