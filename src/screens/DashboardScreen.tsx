import React from 'react';
import { View, Text, StyleSheet, Button, Alert, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext'; 
import CustomButton from '../components/CustomButton'; 
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme'; 
import { Ionicons } from '@expo/vector-icons'; 
import { RootStackParamList } from '../types/navigation';

// Define the specific navigation prop type for this screen
type DashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MainTabs'>;

const DashboardScreen: React.FC = () => { 
  const navigation = useNavigation<DashboardScreenNavigationProp>();
  const { logout, userId } = useAuth(); 

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

  const handleSync = () => {
    Alert.alert('Sync', 'Offline sync functionality not yet implemented.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {userId || 'User'}!</Text>
      {userId && <Text style={styles.userIdText}>User ID: {userId}</Text>}
      
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
          icon={<Ionicons name="list-outline" size={20} />} 
        />
        <View style={{ height: SPACING.medium }} /> 
        <CustomButton 
          title="Random Inventory Check" 
          onPress={() => handleNavigation('Inventory')} 
          variant="secondary"
          icon={<Ionicons name="list-outline" size={20} />} 
        />
      </View>

      <View style={styles.syncContainer}>
        <Button title="Sync Now" onPress={handleSync} />
      </View>
      
      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Ionicons name="log-out-outline" size={24} color={COLORS.white} />
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.large,
    backgroundColor: COLORS.background, 
  },
  title: {
    fontSize: FONTS.xxlarge,
    fontWeight: 'bold',
    color: COLORS.text, 
    marginBottom: SPACING.medium,
  },
  userIdText: {
    fontSize: FONTS.large,
    color: COLORS.text, 
    marginBottom: SPACING.medium,
  },
  buttonContainer: {
    marginBottom: SPACING.large, 
    backgroundColor: COLORS.white, 
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.large,
    ...SHADOWS.medium,
  },
  syncContainer: {
    marginTop: 'auto', 
    alignItems: 'center',
    paddingBottom: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.error, 
    paddingVertical: SPACING.medium,
    paddingHorizontal: SPACING.large,
    borderRadius: BORDER_RADIUS.medium,
    marginTop: SPACING.large,
    alignSelf: 'center', 
    ...SHADOWS.small, 
  },
  logoutButtonText: {
    color: COLORS.white,
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    marginLeft: SPACING.small,
  },
});

export default DashboardScreen;