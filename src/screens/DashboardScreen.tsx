import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext'; 
import CustomButton from '../components/CustomButton'; 
import SyncStatusPanel from '../components/SyncStatusPanel';
import NetworkStatusIndicator from '../components/NetworkStatusIndicator';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme'; 
import { Ionicons } from '@expo/vector-icons'; 
import { RootStackParamList } from '../types/navigation';
import salesforceService from '../services/salesforceService';

// Define the specific navigation prop type for this screen
type DashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MainTabs'>;

const DashboardScreen: React.FC = () => { 
  const navigation = useNavigation<DashboardScreenNavigationProp>();
  const { logout, userId } = useAuth(); 

  // Initialize Salesforce service when dashboard loads
  useEffect(() => {
    salesforceService.initSalesforceService();
  }, []);

  const handleNavigation = (mode: 'Single' | 'Batch' | 'Inventory') => {
    if (!userId) {
      Alert.alert("Error", "User ID not found. Please log in again.");
      logout(); // Log out if userId is missing
      return;
    }
    navigation.navigate('PhotoCapture', { 
      mode: mode, 
      userId: userId, // Pass userId from context
    });
  };

  const handleDebugNavigation = () => {
    navigation.navigate('Debug');
  };

  return (
    <SafeAreaView style={styles.scrollView}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Welcome, {userId || 'User'}!</Text>
          <NetworkStatusIndicator 
            showLabel={true}
            size="medium"
            style={styles.networkIndicator}
          />
        </View>
        
        {userId && <Text style={styles.userIdText}>User ID: {userId}</Text>}
        
        {/* Sync Status Panel */}
        <SyncStatusPanel />
        
        <View style={styles.buttonContainer}>
          <CustomButton 
            title="Capture Single Part Photo" 
            onPress={() => handleNavigation('Single')} 
            variant="primary"
            icon={<Ionicons name="camera-outline" size={20} />} 
          />
          <View style={{ height: SPACING.medium }} /> 
          <CustomButton 
            title="Capture Batch for Order" 
            onPress={() => handleNavigation('Batch')} 
            variant="secondary"
            icon={<Ionicons name="layers-outline" size={20} />} 
          />
          <View style={{ height: SPACING.medium }} /> 
          <CustomButton 
            title="Random Inventory Check" 
            onPress={() => handleNavigation('Inventory')} 
            variant="secondary"
            icon={<Ionicons name="cube-outline" size={20} />} 
          />
        </View>
        
        {/* Debug Button */}
        <TouchableOpacity style={styles.debugButton} onPress={handleDebugNavigation}>
          <Ionicons name="bug-outline" size={16} color={COLORS.textLight} />
          <Text style={styles.debugButtonText}>View Debug Logs</Text>
        </TouchableOpacity>
        
        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={24} color={COLORS.white} />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollViewContent: {
    padding: SPACING.large,
    paddingBottom: SPACING.xxlarge,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.small,
  },
  title: {
    fontSize: FONTS.xxlarge,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  networkIndicator: {
    marginLeft: SPACING.medium,
  },
  userIdText: {
    fontSize: FONTS.medium,
    color: COLORS.textLight, 
    marginBottom: SPACING.medium,
  },
  buttonContainer: {
    marginTop: SPACING.medium,
    marginBottom: SPACING.large, 
    backgroundColor: COLORS.white, 
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.large,
    ...SHADOWS.medium,
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.small,
    marginTop: SPACING.large,
    alignSelf: 'center',
  },
  debugButtonText: {
    color: COLORS.textLight,
    fontSize: FONTS.small,
    marginLeft: SPACING.tiny,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.error, 
    paddingVertical: SPACING.medium,
    paddingHorizontal: SPACING.large,
    borderRadius: BORDER_RADIUS.medium,
    marginTop: SPACING.medium,
    alignSelf: 'center', 
    ...SHADOWS.small, 
  },
  logoutButtonText: {
    color: COLORS.white,
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    marginLeft: SPACING.small,
  },
});

export default DashboardScreen;