## Relevant Files

- `src/screens/LoginScreen.tsx` - Main login screen component redesigned with react-native-paper components, including Material Design input fields, password visibility toggle, and card-based layout.
- `src/screens/LoginScreen.test.tsx` - Comprehensive test file created to verify the redesigned login screen functionality, including component rendering, password visibility toggle, loading states, and error handling.

### Notes

- Unit tests should be created to verify the new functionality, especially the password visibility toggle and component rendering.
- Manual testing will be required to confirm the visual appeal and usability of the final design on a device.
- Use `npx jest src/screens/LoginScreen.test.tsx` to run the tests for the login screen.

## Tasks

- [x] 1.0 **Setup and Component Imports**
  - [x] 1.1 Import `TextInput`, `Button`, and `Card` from `react-native-paper`.
  - [x] 1.2 Import `useState` from `react` for managing password visibility.

- [x] 2.0 **Refactor Input Fields**
  - [x] 2.1 Replace the username `TextInput` with a `react-native-paper` `TextInput` component.
  - [x] 2.2 Configure the username input with `mode="outlined"`, a `label`, and a left-aligned icon (e.g., `account-outline`).
  - [x] 2.3 Replace the password `TextInput` with a `react-native-paper` `TextInput` component.
  - [x] 2.4 Configure the password input with `mode="outlined"`, a `label`, and a left-aligned icon (e.g., `lock-outline`).

- [x] 3.0 **Implement Password Visibility Toggle**
  - [x] 3.1 Add a `useState` hook to manage the `isPasswordVisible` state, defaulting to `false`.
  - [x] 3.2 Add a `right` prop to the password `TextInput` to render a `TextInput.Icon`.
  - [x] 3.3 Set the icon dynamically based on the `isPasswordVisible` state (e.g., `eye` or `eye-off`).
  - [x] 3.4 Implement the `onPress` event for the icon to toggle the `isPasswordVisible` state.
  - [x] 3.5 Bind the `secureTextEntry` prop of the password `TextInput` to the inverse of the `isPasswordVisible` state.

- [x] 4.0 **Refactor Buttons and Links**
  - [x] 4.1 Replace the login `TouchableOpacity` with a `react-native-paper` `Button` component.
  - [x] 4.2 Configure the button with `mode="contained"` and bind its `onPress` to the `handleLogin` function.
  - [x] 4.3 Ensure the button displays an `ActivityIndicator` when `isLoading` is `true`.
  - [x] 4.4 Verify the "Sign Up" link is still functional and styled appropriately.

- [x] 5.0 **Stylize and Finalize Layout**
  - [x] 5.1 Increase the font size and weight of the "Quality Control PIC" title to give it more prominence.
  - [x] 5.2 Wrap the form elements in a `react-native-paper` `Card` component to provide a clear visual grouping and elevation.
  - [x] 5.3 Adjust the overall spacing and container styles to ensure a clean, centered, and visually balanced layout.

- [x] 6.0 **Verify Functionality**
  - [x] 6.1 Create a new test file: `src/screens/LoginScreen.test.tsx`.
  - [x] 6.2 Write a test to ensure the screen renders correctly with the new `react-native-paper` components.
  - [x] 6.3 Write a test to verify that the password visibility toggle works as expected.
  - [x] 6.4 Manually run the app on a device or simulator to confirm the visual changes and that the login process (including error handling) still works correctly.
