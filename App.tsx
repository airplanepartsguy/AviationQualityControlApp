import 'react-native-gesture-handler'; // Must be at the top
import React, { useEffect } from 'react';
import { Platform, ActivityIndicator, View, StyleSheet, Animated, Easing, Pressable } from 'react-native'; // Import Platform
import { NavigationContainer, DefaultTheme, useNavigation } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons'; // For tab icons
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

// Import Screens
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import DashboardScreen from './src/screens/DashboardScreen'; 
import PhotoCaptureScreen from './src/screens/PhotoCaptureScreen';
import DefectHighlightingScreen from './src/screens/DefectHighlightingScreen';
import AnnotationScreen from './src/screens/AnnotationScreen'; 
import BatchPreviewScreen from './src/screens/BatchPreviewScreen'; 
import PDFGenerationScreen from './src/screens/PDFGenerationScreen';
// import AnalyticsScreen from './src/screens/AnalyticsScreen'; // Replaced by History, ERP, Settings
import DebugScreen from './src/screens/DebugScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ERPScreen from './src/screens/ERPScreen';
import AllBatchesScreen from './src/screens/AllBatchesScreen'; // Import the new screen
import SettingsScreen from './src/screens/SettingsScreen';
import AdminScreen from './src/screens/AdminScreen';
import SalesforceConfigScreen from './src/screens/SalesforceConfigScreen';
import SalesforceTestScreen from './src/screens/SalesforceTestScreen';

// Import Navigation Types
import { RootStackParamList, BottomTabParamList } from './src/types/navigation'; // Updated types
import { COLORS, FONTS, SHADOWS } from './src/styles/theme'; // Import theme

// Import Contexts
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { SyncProvider } from './src/contexts/SyncContext';
import { CompanyProvider } from './src/contexts/CompanyContext';

// Import Services
import networkService from './src/services/networkService';

// Import Components
import SyncManager from './src/components/SyncManager';

// Define a separate stack for Authentication flow
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
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

// Placeholder component for the action tab
const EmptyScreen = () => null;

// Custom Capture Button Component
const CustomCaptureButton = () => {
  const scaleValue = React.useRef(new Animated.Value(1)).current;
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth(); // Get auth state
  const userId = user?.id; // Derive userId

  return (
    <Pressable
      // onPressIn={handlePressIn}
      // onPressOut={handlePressOut}
      // onPress will be triggered after onPressOut
      onPress={() => {
        if (isAuthenticated && userId) { // Use isAuthenticated and the derived userId
          navigation.navigate('PhotoCapture', { 
            mode: 'Single', 
            userId: userId,
            quickCapture: true 
          });
        } else {
          // Handle case where user is not authenticated or userId is missing
          // Optionally, navigate to login or show a message
          console.warn('User not authenticated or userId missing for capture action.');
          // Example: navigation.navigate('Login'); 
        }
      }}
      style={{
        // Style for the Pressable container, e.g., for layout within the tab bar
        // position: 'relative', // Already default
        // width: 70, // Dimensions will be controlled by Animated.View
        // height: 70,
        // borderRadius: 35, 
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={{
          transform: [{ scale: scaleValue }],
          width: 70, // Keep basic dimensions
          height: 70,
          backgroundColor: 'magenta', // Use a very obvious color for debugging
          borderRadius: 35,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Ionicons name="camera" size={36} color={COLORS.white} />
      </Animated.View>
    </Pressable>
  );
};

// --- Bottom Tab Navigator ---
// This will be nested inside the main Stack Navigator
function MainTabs() { // Renamed from MainAppTabs
  // Removed user ID logic, handled by AuthContext now

  return (
    <Tab.Navigator
      // Ensure Tab.Navigator has access to stack navigation for the custom button
      // This might require passing navigation prop down or using useNavigation hook inside CustomTabBarButton

      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          // Use updated tab names
          if (route.name === 'HomeTab') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'HistoryTab') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'ERPTab') {
            iconName = focused ? 'cloud-upload' : 'cloud-upload-outline';
          } else if (route.name === 'SettingsTab') {
            iconName = focused ? 'settings' : 'settings-outline';
          } else {
            iconName = 'ellipse-outline'; // Default for CaptureActionTab or any other unexpected tab
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
      {/* Updated Tab Order: Home, History, ERP, Settings */}
      <Tab.Screen 
        name="HomeTab" 
        component={DashboardScreen} 
        options={{ title: 'Home' }} 
      />
      <Tab.Screen 
        name="HistoryTab" 
        component={HistoryScreen} 
        options={{ title: 'History' }} 
      />
      {/* <Tab.Screen 
        name="CaptureActionTab" 
        component={EmptyScreen} // Placeholder, button handles action
        options={{
          tabBarButton: () => (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <CustomCaptureButton />
            </View>
          ),
          tabBarLabel: () => null, // No label for the action button tab
        }}
      /> */}
      <Tab.Screen 
        name="ERPTab" 
        component={ERPScreen} 
        options={{ title: 'ERP' }} 
      />
      {/* All Batches Tab */}
      <Tab.Screen
        name="AllBatchesTab"
        component={AllBatchesScreen}
        options={{
          tabBarLabel: 'All Batches',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'list-circle' : 'list-circle-outline'} size={size} color={color} />
          ),
          title: 'All Batches' // Added title for the header
        }}
      />
      <Tab.Screen 
        name="SettingsTab" 
        component={SettingsScreen} 
        options={{ title: 'Settings' }} 
      />
    </Tab.Navigator>
  );
}

// --- Root Navigator Component (Handles Auth vs Main App) ---
// Define linking configuration
const prefix = Linking.createURL('/'); // Resolves to AviationQualityControlApp:// based on app.json scheme
const linkingConfig = {
  prefixes: [prefix],
  config: {
    screens: {
      // Map the auth-callback path to the Login screen.
      // When the app opens with AviationQualityControlApp://auth-callback,
      // React Navigation will try to navigate to the Login screen.
      // The Supabase client, initialized within AuthProvider,
      // should then process the URL tokens (e.g., #access_token=...)
      // via its onAuthStateChange listener and update the auth state.
      Login: 'auth-callback',
      // Map OAuth success callback to Salesforce config screen
      // When the app opens with AviationQualityControlApp://oauth/success?state=companyId,
      // React Navigation will navigate to the SalesforceConfig screen
      SalesforceConfig: 'oauth/success',
    },
  },
};

// Custom Tab Button (Alternative, more structured way if complex)
// const CustomTabBarButton = ({ children, onPress }) => (
//   <TouchableOpacity
//     style={{
//       top: -25, // Make it pop
//       justifyContent: 'center',
//       alignItems: 'center',
//       width: 70,
//       height: 70,
//       borderRadius: 35,
//       backgroundColor: COLORS.primary, // Use theme color
//       ...SHADOWS.medium, // Add some shadow
//     }}
//     onPress={onPress}
//   >
//     <Ionicons name="camera" size={32} color={COLORS.white} />
//     {/* {children} You might not need children if icon is static */}
//   </TouchableOpacity>
// );

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth(); // This should now be correct

  if (isLoading) {
    // Show a loading screen while checking auth state
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={AppTheme} linking={linkingConfig}>
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
            options={{ 
              title: 'Capture Photo',
              headerBackTitle: 'Back' // Set explicit back button text
            }} // Keep header for stack screens
          />
          <RootStack.Screen 
            name="DefectHighlighting" 
            component={DefectHighlightingScreen} 
            options={{ 
              title: 'Highlight Defects',
              headerBackTitle: 'Back'
            }} 
          />
          <RootStack.Screen 
            name="Annotation" 
            component={AnnotationScreen} 
            options={{ 
              title: 'Annotate Photo',
              headerBackTitle: 'Back'
            }} 
          />
          <RootStack.Screen 
            name="BatchPreview" 
            component={BatchPreviewScreen} 
            options={{ 
              title: 'Review Batch',
              headerBackTitle: 'Back' // Set explicit back button text
            }} 
          />
          <RootStack.Screen 
            name="PDFGeneration" 
            component={PDFGenerationScreen} 
            options={{ 
              title: 'Generate PDF Report',
              headerBackTitle: 'Back'
            }} 
          />
          <RootStack.Screen 
            name="Debug" 
            component={DebugScreen} 
            options={{ 
              title: 'Debug Tools',
              headerBackTitle: 'Back'
            }} 
          />
          <RootStack.Screen 
            name="Admin" 
            component={AdminScreen} 
            options={{ 
              title: 'Admin Panel',
              headerBackTitle: 'Back'
            }} 
          />
          <RootStack.Screen 
            name="SalesforceConfig" 
            component={SalesforceConfigScreen} 
            options={{ 
              title: 'Salesforce Configuration',
              headerBackTitle: 'Back'
            }} 
          />
          <RootStack.Screen 
            name="SalesforceTest" 
            component={SalesforceTestScreen} 
            options={{ 
              title: 'Salesforce Upload Test',
              headerBackTitle: 'Back'
            }} 
          />
        </RootStack.Navigator>
      ) : (
        <AuthStack.Navigator
          screenOptions={{ 
            headerShown: false // Usually hide header for login screen
          }}
        >
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="SignUp" component={SignUpScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

// --- Main App Component (Wraps RootNavigator with AuthProvider and SyncProvider) ---
const App: React.FC = () => {
  // Initialize network monitoring
  useEffect(() => {
    const unsubscribe = networkService.initNetworkMonitoring();
    
    return () => {
      unsubscribe();
    };
  }, []);
  

  
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CompanyProvider>
          <SyncProvider>
            <SyncManager>
              <RootNavigator />
            </SyncManager>
          </SyncProvider>
        </CompanyProvider>
      </AuthProvider>
    </SafeAreaProvider>
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
