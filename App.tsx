import 'react-native-gesture-handler'; // Must be at the top
import React, { useEffect } from 'react';
import { Platform, ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { navigationRef, NavigationService } from './src/services/navigationService';
import * as Linking from 'expo-linking';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import Screens
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import DashboardScreen from './src/screens/DashboardScreen'; 
import PhotoCaptureScreen from './src/screens/PhotoCaptureScreen';
import DefectHighlightingScreen from './src/screens/DefectHighlightingScreen';
import AnnotationScreen from './src/screens/AnnotationScreen'; 
import BatchPreviewScreen from './src/screens/BatchPreviewScreen'; 
import PDFGenerationScreen from './src/screens/PDFGenerationScreen';
import DebugScreen from './src/screens/DebugScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ERPScreen from './src/screens/ERPScreen';
import AllBatchesScreen from './src/screens/AllBatchesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AdminScreen from './src/screens/AdminScreen';
import SalesforceConfigScreen from './src/screens/SalesforceConfigScreen';
import SalesforceTestScreen from './src/screens/SalesforceTestScreen';

// Import Navigation Types
import { RootStackParamList, BottomTabParamList } from './src/types/navigation';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from './src/styles/theme';

// Import Contexts
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { SyncProvider } from './src/contexts/SyncContext';
import { CompanyProvider } from './src/contexts/CompanyContext';

// Import Services
import networkService from './src/services/networkService';

// Import Components
import SyncManager from './src/components/SyncManager';
import { QuickCaptureButton } from './src/components/FloatingActionButton';

// Define a separate stack for Authentication flow
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

const AuthStack = createStackNavigator<AuthStackParamList>();
const RootStack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<BottomTabParamList>();

// Enhanced theme for React Navigation
const AppTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary,
    background: COLORS.background,
    card: COLORS.surface,
    text: COLORS.text, 
    border: COLORS.border,
    notification: COLORS.accent,
  },
};

// Enhanced Tab Navigator with better workflow-focused structure
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          switch (route.name) {
            case 'HomeTab':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'AllBatchesTab':
              iconName = focused ? 'folder-open' : 'folder-open-outline';
              break;
            case 'ERPTab':
              iconName = focused ? 'cloud-upload' : 'cloud-upload-outline';
              break;
            case 'HistoryTab':
              iconName = focused ? 'time' : 'time-outline';
              break;
            case 'SettingsTab':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
            default:
              iconName = 'ellipse-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.grey500,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingBottom: Platform.OS === 'ios' ? 8 : 4,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 64,
          ...SHADOWS.small,
        },
        tabBarLabelStyle: {
          fontSize: FONTS.small,
          fontWeight: FONTS.mediumWeight,
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        headerStyle: { 
          backgroundColor: COLORS.primary,
          borderBottomWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: COLORS.white,
        headerTitleStyle: { 
          fontWeight: FONTS.bold, 
          fontSize: FONTS.large 
        },
        headerShown: true,
      })}
    >
      {/* Optimized Tab Order for Quality Control Workflow */}
      <Tab.Screen 
        name="HomeTab" 
        component={DashboardScreen} 
        options={{ 
          title: 'Dashboard',
          tabBarLabel: 'Home',
        }} 
      />
      <Tab.Screen
        name="AllBatchesTab"
        component={AllBatchesScreen}
        options={{
          title: 'All Batches',
          tabBarLabel: 'Batches',
        }}
      />
      <Tab.Screen 
        name="ERPTab" 
        component={ERPScreen} 
        options={{ 
          title: 'ERP Integration',
          tabBarLabel: 'ERP',
        }} 
      />
      <Tab.Screen 
        name="HistoryTab" 
        component={HistoryScreen} 
        options={{ 
          title: 'History',
          tabBarLabel: 'History',
        }} 
      />
      <Tab.Screen 
        name="SettingsTab" 
        component={SettingsScreen} 
        options={{ 
          title: 'Settings',
          tabBarLabel: 'Settings',
        }} 
      />
    </Tab.Navigator>
  );
}

// Enhanced Stack Navigator with better screen configuration
function RootNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={AppTheme} linking={linkingConfig}>
      {isAuthenticated ? (
        <View style={{ flex: 1 }}>
          <RootStack.Navigator 
            initialRouteName="MainTabs"
            screenOptions={{ 
              headerStyle: { 
                backgroundColor: COLORS.primary,
                borderBottomWidth: 0,
                elevation: 4,
                shadowColor: COLORS.black,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
              },
              headerTintColor: COLORS.white,
              headerTitleStyle: { 
                fontWeight: FONTS.bold, 
                fontSize: FONTS.large 
              },
              headerBackTitle: 'Back',
              gestureEnabled: true,
              cardStyleInterpolator: ({ current, layouts }) => {
                return {
                  cardStyle: {
                    transform: [
                      {
                        translateX: current.progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [layouts.screen.width, 0],
                        }),
                      },
                    ],
                  },
                };
              },
            }}
          >
            {/* Main App Screens */}
            <RootStack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ 
                headerShown: false 
              }} 
            />
            
            {/* Photo Workflow Screens */}
            <RootStack.Screen 
              name="PhotoCapture" 
              component={PhotoCaptureScreen} 
              options={{ 
                title: 'Capture Photos',
                headerRight: () => null, // Remove any default right button
              }} 
            />
            <RootStack.Screen 
              name="DefectHighlighting" 
              component={DefectHighlightingScreen} 
              options={{ 
                title: 'Mark Defects',
                presentation: 'modal', // Present as modal for better UX
              }} 
            />
            <RootStack.Screen 
              name="Annotation" 
              component={AnnotationScreen} 
              options={{ 
                title: 'Add Notes',
                presentation: 'modal',
              }} 
            />
            
            {/* Batch Management Screens */}
            <RootStack.Screen 
              name="BatchPreview" 
              component={BatchPreviewScreen} 
              options={{ 
                title: 'Review Batch',
              }} 
            />
            <RootStack.Screen 
              name="PDFGeneration" 
              component={PDFGenerationScreen} 
              options={{ 
                title: 'Generate Report',
              }} 
            />
            
            {/* Configuration & Admin Screens */}
            <RootStack.Screen 
              name="SalesforceConfig" 
              component={SalesforceConfigScreen} 
              options={{ 
                title: 'Salesforce Setup',
                presentation: 'modal',
              }} 
            />
            <RootStack.Screen 
              name="SalesforceTest" 
              component={SalesforceTestScreen} 
              options={{ 
                title: 'Test Upload',
                presentation: 'modal',
              }} 
            />
            <RootStack.Screen 
              name="Admin" 
              component={AdminScreen} 
              options={{ 
                title: 'Admin Panel',
                presentation: 'modal',
              }} 
            />
            <RootStack.Screen 
              name="Debug" 
              component={DebugScreen} 
              options={{ 
                title: 'Debug Tools',
                presentation: 'modal',
              }} 
            />
          </RootStack.Navigator>
          
          {/* Floating Action Button for Quick Photo Capture */}
          <QuickCaptureButton
            onPress={() => {
              if (user?.id) {
                NavigationService.quickCapture(user.id);
              }
            }}
            disabled={!user?.id}
          />
        </View>
      ) : (
        <AuthStack.Navigator
          screenOptions={{ 
            headerShown: false,
            gestureEnabled: true,
            cardStyleInterpolator: ({ current, layouts }) => {
              return {
                cardStyle: {
                  transform: [
                    {
                      translateX: current.progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [layouts.screen.width, 0],
                      }),
                    },
                  ],
                },
              };
            },
          }}
        >
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="SignUp" component={SignUpScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

// Define linking configuration
const prefix = Linking.createURL('/');
const linkingConfig = {
  prefixes: [prefix],
  config: {
    screens: {
      Login: 'auth-callback',
      SalesforceConfig: 'oauth/success',
    },
  },
};

// Enhanced Main App Component
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

// Enhanced styles
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
