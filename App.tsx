import 'react-native-gesture-handler'; // Must be at the top
import React from 'react';
import { Platform, ActivityIndicator, View, StyleSheet } from 'react-native'; // Import Platform
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons'; // For tab icons

// Import Screens
import LoginScreen from './src/screens/LoginScreen'; // Import LoginScreen
import DashboardScreen from './src/screens/DashboardScreen'; 
import PhotoCaptureScreen from './src/screens/PhotoCaptureScreen';
import AnnotationScreen from './src/screens/AnnotationScreen'; 
import BatchPreviewScreen from './src/screens/BatchPreviewScreen'; 
import PDFGenerationScreen from './src/screens/PDFGenerationScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen'; // Removed .tsx extension
import DebugScreen from './src/screens/DebugScreen';       // Removed .tsx extension

// Import Navigation Types
import { RootStackParamList, BottomTabParamList } from './src/types/navigation'; // Updated types
import { COLORS, FONTS } from './src/styles/theme'; // Import theme

// Import Auth Context
import { AuthProvider, useAuth } from './src/contexts/AuthContext';

// Define a separate stack for Authentication flow
type AuthStackParamList = {
  Login: undefined;
};

const AuthStack = createStackNavigator<AuthStackParamList>();
const RootStack = createStackNavigator<RootStackParamList>(); // Keep RootStack for main app
const Tab = createBottomTabNavigator<BottomTabParamList>(); // Use BottomTabParamList

// Define a theme for React Navigation to use our app colors
const AppTheme = {
  ...DefaultTheme,
  dark: false, // Assuming light mode
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary,
    background: COLORS.background,
    card: COLORS.card, // Used for headers, tab bars etc.
    text: COLORS.text, 
    border: COLORS.border,
    notification: COLORS.accent, // Use accent for notifications
  },
};

// --- Bottom Tab Navigator ---
// This will be nested inside the main Stack Navigator
function MainTabs() { // Renamed from MainAppTabs
  // Removed user ID logic, handled by AuthContext now

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          // Use updated tab names
          if (route.name === 'DashboardTab') {
            iconName = focused ? 'grid' : 'grid-outline'; // Changed icon
          } else if (route.name === 'AnalyticsTab') {
            iconName = focused ? 'stats-chart' : 'stats-chart-outline';
          } else {
            iconName = 'ellipse-outline'; // Default icon
          }
          // Added nullish coalescing for safety, though logic covers cases
          return <Ionicons name={iconName ?? 'alert-circle-outline'} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.grey600,
        tabBarStyle: {
          backgroundColor: COLORS.card, // Use card color for tab background
          borderTopColor: COLORS.border,
          borderTopWidth: StyleSheet.hairlineWidth, // Use hairline for subtle border
          // Add some padding for iOS bottom safe area if needed, or handle with SafeAreaView
          paddingBottom: Platform.OS === 'ios' ? 5 : 0, 
          height: Platform.OS === 'ios' ? 90 : 60, // Adjust height if needed
        },
        tabBarLabelStyle: {
          fontSize: FONTS.small,
          fontWeight: FONTS.mediumWeight, // Use medium weight
        },
        headerStyle: { 
          backgroundColor: COLORS.primary, 
          // Add shadow if desired (more common on iOS)
          // ...Platform.select({ ios: SHADOWS.small, android: { elevation: 4 } })
         },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: FONTS.bold, fontSize: FONTS.large },
        headerShown: true, // Show header on individual tab screens
      })}
    >
      {/* Use updated tab names and remove initialParams for now */}
      <Tab.Screen 
        name="DashboardTab" 
        component={DashboardScreen} 
        options={{ title: 'Dashboard' }} 
      />
      <Tab.Screen 
        name="AnalyticsTab" 
        component={AnalyticsScreen} 
        options={{ title: 'Analytics' }} 
      />
    </Tab.Navigator>
  );
}

// --- Root Navigator Component (Handles Auth vs Main App) ---
function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Show a loading screen while checking auth state
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={AppTheme}>
      {isAuthenticated ? (
        <RootStack.Navigator 
          initialRouteName="MainTabs" // Start with the Tab navigator
          screenOptions={{ 
            headerStyle: { backgroundColor: COLORS.primary },
            headerTintColor: COLORS.white,
            headerTitleStyle: { fontWeight: FONTS.bold, fontSize: FONTS.large },
          }}
        >
          {/* Main App Screens */}
          <RootStack.Screen
            name="MainTabs" // Route name for the tab navigator container
            component={MainTabs} // Use the updated MainTabs component
            options={{ 
              headerShown: false // Hide the Stack Navigator's header for the tabs screen
            }} 
          />
          <RootStack.Screen 
            name="PhotoCapture" 
            component={PhotoCaptureScreen} 
            options={{ title: 'Capture Photo' }} // Keep header for stack screens
          />
          <RootStack.Screen 
            name="Annotation" 
            component={AnnotationScreen} 
            options={{ title: 'Annotate Photo' }} 
          />
          <RootStack.Screen 
            name="BatchPreview" 
            component={BatchPreviewScreen} 
            options={{ title: 'Review Batch' }} 
          />
          <RootStack.Screen 
            name="PDFGeneration" 
            component={PDFGenerationScreen} 
            options={{ title: 'Generate PDF' }} // Shortened title 
          />
          <RootStack.Screen 
            name="Debug" 
            component={DebugScreen} 
            options={{ title: 'Debug Logs' }} 
          />
        </RootStack.Navigator>
      ) : (
        <AuthStack.Navigator
          screenOptions={{ 
            headerShown: false // Usually hide header for login screen
          }}
        >
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

// --- Main App Component (Wraps RootNavigator with AuthProvider) ---
const App: React.FC = () => {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

export default App;

// Removed duplicate StyleSheet import from here

// Add styles for loading container
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background, // Match app background
  },
});
