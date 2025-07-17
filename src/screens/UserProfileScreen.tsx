import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, CARD_STYLES } from '../styles/theme';
import * as databaseService from '../services/databaseService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserStats {
  totalBatches: number;
  totalPhotos: number;
  completedInspections: number;
  pendingTasks: number;
}

interface UserPreferences {
  notifications: boolean;
  autoSync: boolean;
  darkMode: boolean;
  locationTracking: boolean;
}

const UserProfileScreen: React.FC = () => {
  const { user, updateUser, logout } = useAuth();
  const [stats, setStats] = useState<UserStats>({
    totalBatches: 0,
    totalPhotos: 0,
    completedInspections: 0,
    pendingTasks: 0
  });
  const [preferences, setPreferences] = useState<UserPreferences>({
    notifications: true,
    autoSync: true,
    darkMode: false,
    locationTracking: true
  });
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    department: '',
    title: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadUserStats();
    loadUserPreferences();
  }, []);

  const loadUserStats = async () => {
    if (!user?.id) return;
    
    try {
      const batches = await databaseService.getAllPhotoBatchesForUser(user.id);
      const totalPhotos = batches.reduce((sum, batch) => sum + batch.photoCount, 0);
      const completedInspections = batches.filter(b => b.status === 'completed').length;
      const pendingTasks = batches.filter(b => b.status === 'pending').length;
      
      setStats({
        totalBatches: batches.length,
        totalPhotos,
        completedInspections,
        pendingTasks
      });
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  const loadUserPreferences = async () => {
    try {
      const savedPrefs = await AsyncStorage.getItem('userPreferences');
      if (savedPrefs) {
        setPreferences(JSON.parse(savedPrefs));
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const saveUserPreferences = async (newPrefs: UserPreferences) => {
    try {
      await AsyncStorage.setItem('userPreferences', JSON.stringify(newPrefs));
      setPreferences(newPrefs);
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  };

  const handlePreferenceToggle = (key: keyof UserPreferences, value: boolean) => {
    const newPrefs = { ...preferences, [key]: value };
    saveUserPreferences(newPrefs);
  };

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      // Update user profile
      await updateUser({
        name: editForm.name,
        email: editForm.email
      });
      
      setIsEditModalVisible(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout }
      ]
    );
  };

  const renderStatCard = (title: string, value: number, icon: string, color: string) => (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );

  const renderPreferenceItem = (
    title: string,
    subtitle: string,
    key: keyof UserPreferences,
    icon: string
  ) => (
    <View style={styles.preferenceItem}>
      <View style={styles.preferenceInfo}>
        <Ionicons name={icon as any} size={20} color={COLORS.primary} />
        <View style={styles.preferenceText}>
          <Text style={styles.preferenceTitle}>{title}</Text>
          <Text style={styles.preferenceSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={preferences[key]}
        onValueChange={(value) => handlePreferenceToggle(key, value)}
        trackColor={{ false: COLORS.border, true: COLORS.primary }}
        thumbColor={preferences[key] ? COLORS.white : COLORS.textLight}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: user?.avatar || 'https://via.placeholder.com/100' }}
              style={styles.avatar}
            />
            <TouchableOpacity style={styles.editAvatarButton}>
              <Ionicons name="camera" size={16} color={COLORS.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{user?.name || 'User Name'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'user@example.com'}</Text>
            <Text style={styles.userRole}>{user?.role || 'Member'} • {user?.company || 'Company'}</Text>
          </View>
          <TouchableOpacity 
            style={styles.editButton}
            onPress={() => {
              setEditForm({
                name: user?.name || '',
                email: user?.email || '',
                phone: '',
                department: '',
                title: ''
              });
              setIsEditModalVisible(true);
            }}
          >
            <Ionicons name="pencil" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Stats Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Overview</Text>
          <View style={styles.statsContainer}>
            {renderStatCard('Batches', stats.totalBatches, 'folder', COLORS.primary)}
            {renderStatCard('Photos', stats.totalPhotos, 'camera', COLORS.success)}
            {renderStatCard('Completed', stats.completedInspections, 'checkmark-circle', COLORS.success)}
            {renderStatCard('Pending', stats.pendingTasks, 'time', COLORS.warning)}
          </View>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            {renderPreferenceItem(
              'Push Notifications',
              'Receive alerts and updates',
              'notifications',
              'notifications'
            )}
            {renderPreferenceItem(
              'Auto Sync',
              'Automatically sync data when online',
              'autoSync',
              'sync'
            )}
            {renderPreferenceItem(
              'Dark Mode',
              'Use dark theme interface',
              'darkMode',
              'moon'
            )}
            {renderPreferenceItem(
              'Location Tracking',
              'Include location data with photos',
              'locationTracking',
              'location'
            )}
          </View>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.actionItem}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
              <Text style={styles.actionText}>Privacy & Security</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionItem}>
              <Ionicons name="help-circle" size={20} color={COLORS.primary} />
              <Text style={styles.actionText}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionItem}>
              <Ionicons name="information-circle" size={20} color={COLORS.primary} />
              <Text style={styles.actionText}>About</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionItem, styles.logoutItem]} onPress={handleLogout}>
              <Ionicons name="log-out" size={20} color={COLORS.error} />
              <Text style={[styles.actionText, styles.logoutText]}>Sign Out</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
              <Text style={styles.modalCancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSaveProfile} disabled={isLoading}>
              <Text style={[styles.modalSaveButton, isLoading && styles.disabledButton]}>
                {isLoading ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.name}
                onChangeText={(text) => setEditForm({ ...editForm, name: text })}
                placeholder="Enter your full name"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.email}
                onChangeText={(text) => setEditForm({ ...editForm, email: text })}
                placeholder="Enter your email"
                placeholderTextColor={COLORS.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.phone}
                onChangeText={(text) => setEditForm({ ...editForm, phone: text })}
                placeholder="Enter your phone number"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Department</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.department}
                onChangeText={(text) => setEditForm({ ...editForm, department: text })}
                placeholder="Enter your department"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Job Title</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.title}
                onChangeText={(text) => setEditForm({ ...editForm, title: text })}
                placeholder="Enter your job title"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
          </ScrollView>
          
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
    padding: SPACING.medium,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    ...CARD_STYLES.elevated,
    padding: SPACING.medium,
    marginBottom: SPACING.large,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.border,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: SPACING.medium,
  },
  userName: {
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.tiny,
  },
  userEmail: {
    fontSize: FONTS.regular,
    color: COLORS.textLight,
    marginBottom: SPACING.tiny,
  },
  userRole: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
  },
  editButton: {
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    backgroundColor: COLORS.primaryLight,
  },
  section: {
    marginBottom: SPACING.large,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    ...CARD_STYLES.elevated,
    flex: 1,
    alignItems: 'center',
    padding: SPACING.medium,
    marginHorizontal: SPACING.tiny,
  },
  statValue: {
    fontSize: FONTS.xlarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: SPACING.small,
  },
  statTitle: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.tiny,
  },
  card: {
    ...CARD_STYLES.elevated,
    padding: 0,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  preferenceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  preferenceText: {
    marginLeft: SPACING.medium,
    flex: 1,
  },
  preferenceTitle: {
    fontSize: FONTS.regular,
    color: COLORS.text,
    marginBottom: SPACING.tiny,
  },
  preferenceSubtitle: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  actionText: {
    fontSize: FONTS.regular,
    color: COLORS.text,
    flex: 1,
    marginLeft: SPACING.medium,
  },
  logoutItem: {
    borderBottomWidth: 0,
  },
  logoutText: {
    color: COLORS.error,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  modalCancelButton: {
    fontSize: FONTS.regular,
    color: COLORS.textLight,
  },
  modalSaveButton: {
    fontSize: FONTS.regular,
    color: COLORS.primary,
    fontWeight: FONTS.semiBold,
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalContent: {
    flex: 1,
    padding: SPACING.medium,
  },
  inputGroup: {
    marginBottom: SPACING.large,
  },
  inputLabel: {
    fontSize: FONTS.regular,
    color: COLORS.text,
    marginBottom: SPACING.small,
    fontWeight: FONTS.mediumWeight,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    fontSize: FONTS.regular,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default UserProfileScreen;
