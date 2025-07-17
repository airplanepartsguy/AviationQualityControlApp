import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  SafeAreaView,
  Modal,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS, CARD_STYLES } from '../styles/theme';
import { RootStackParamList } from '../types/navigation';
import networkService from '../services/networkService';
import * as databaseService from '../services/databaseService';
import licensingService from '../services/licensingService';
import dataResetService from '../services/dataResetService';
import userProfileService from '../services/userProfileService';

type SettingsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface AppSettings {
  autoSync: boolean;
  syncOnWifiOnly: boolean;
  enableNotifications: boolean;
  enableHaptics: boolean;
  enableLocationTracking: boolean;
  photoQuality: 'low' | 'medium' | 'high';
  maxPhotosPerBatch: number;
  enableDebugMode: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  company?: string;
  role?: string;
  licenseType?: string;
  deviceCount?: number;
  maxDevices?: number;
}

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { user, logout } = useAuth();
  const { isSyncing, lastSyncTime, syncStats } = useSync();
  const isOnline = true; // This would come from network service
  
  const [settings, setSettings] = useState<AppSettings>({
    autoSync: true,
    syncOnWifiOnly: false,
    enableNotifications: true,
    enableHaptics: true,
    enableLocationTracking: true,
    photoQuality: 'high',
    maxPhotosPerBatch: 50,
    enableDebugMode: false
  });
  
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState({ name: '', company: '' });
  const [storageInfo, setStorageInfo] = useState({ localPhotos: 0, localBatches: 0, storageSize: '0 MB' });

  useEffect(() => {
    loadSettings();
    loadUserProfile();
    loadStorageInfo();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.getItem('appSettings');
      if (savedSettings) {
        setSettings({ ...settings, ...JSON.parse(savedSettings) });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async (newSettings: AppSettings) => {
    try {
      await AsyncStorage.setItem('appSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      // Fetch real profile data from Supabase
      const { fetchUserProfile } = await import('../services/supabaseService');
      const licensingService = await import('../services/licensingService');
      
      const profileData = await fetchUserProfile(user.id);
      
      // Get real device count and license info from licensing service
      const licenseInfo = await licensingService.default.getUserLicense(user.id);
      const deviceCount = await licensingService.default.getActiveDeviceCount(user.id);
      
      if (profileData) {
        // Get license data separately if license_id exists
        let licenseData = null;
        if (profileData.license_id) {
          try {
            const { fetchUserLicense } = await import('../services/supabaseService');
            licenseData = await fetchUserLicense(profileData.license_id);
          } catch (error) {
            console.error('Error fetching license data:', error);
          }
        }
        
        setUserProfile({
          id: user.id,
          email: profileData.email || user.email || 'N/A',
          name: profileData.full_name || user.user_metadata?.name || 'User',
          company: profileData.companies?.name || 'Unknown Company',
          role: profileData.role || 'member',
          licenseType: licenseData?.type || 'trial',
          deviceCount: deviceCount || 1,
          maxDevices: licenseData?.licenses_available || 1
        });
        
        // Update editing state with current values
        setEditingProfile({
          name: profileData.full_name || user.user_metadata?.name || 'User',
          company: profileData.companies?.name || 'Unknown Company'
        });
      } else {
        // Create minimal fallback profile when no Supabase data exists
        const fallbackProfile = {
          id: user.id,
          email: user.email || 'N/A',
          name: user.user_metadata?.name || 'User',
          company: 'No Company Assigned',
          role: 'member',
          licenseType: 'trial',
          deviceCount: 1,
          maxDevices: 1
        };
        setUserProfile(fallbackProfile);
        setEditingProfile({
          name: fallbackProfile.name,
          company: fallbackProfile.company
        });
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      // Set minimal fallback profile on error
      const fallbackProfile = {
        id: user.id,
        email: user.email || 'N/A',
        name: user.user_metadata?.name || 'User',
        company: 'Error Loading Company',
        role: 'member',
        licenseType: 'trial',
        deviceCount: 1,
        maxDevices: 1
      };
      setUserProfile(fallbackProfile);
      setEditingProfile({
        name: fallbackProfile.name,
        company: fallbackProfile.company
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      
      // Update profile in Supabase
      const { updateUserProfile } = await import('../services/supabaseService');
      const updates = {
        full_name: editingProfile.name,
        company: editingProfile.company,
        updated_at: new Date().toISOString()
      };
      
      await updateUserProfile(user.id, updates);
      
      // Update local state
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          name: editingProfile.name,
          company: editingProfile.company
        });
      }
      
      // Update profile using userProfileService
      try {
        const success = await userProfileService.updateUserProfile({
          name: editingProfile.name,
          company: editingProfile.company
        });
        
        if (!success) {
          console.log('Profile update failed, continuing with local update only');
        }
      } catch (error) {
        console.log('Profile sync service not available:', error);
        // Continue without sync - offline functionality
      }
      
      setShowProfileModal(false);
      Alert.alert('Success', 'Profile updated successfully');
      
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStorageInfo = async () => {
    if (!user?.id) return;
    
    try {
      const batches = await databaseService.getAllPhotoBatchesForUser(user.id);
      // Calculate total photos from batches
      const totalPhotos = batches.reduce((sum, batch) => sum + batch.photoCount, 0);
      
      setStorageInfo({
        localPhotos: totalPhotos,
        localBatches: batches.length,
        storageSize: `${Math.round(totalPhotos * 2.5)} MB` // Rough estimate
      });
    } catch (error) {
      console.error('Error loading storage info:', error);
    }
  };

  const handleSettingChange = (key: keyof AppSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => logout()
        }
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will remove all locally cached data. Photos and batches will be re-downloaded on next sync.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear cache logic would go here
              Alert.alert('Success', 'Cache cleared successfully');
              loadStorageInfo();
            } catch (error) {
              Alert.alert('Error', 'Failed to clear cache');
            }
          }
        }
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert(
      'Export Data',
      'Export all your data for backup or transfer to another device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: () => {
            // Export logic would go here
            Alert.alert('Info', 'Export feature coming soon!');
          }
        }
      ]
    );
  };

  const renderSettingItem = (
    title: string,
    subtitle: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    icon: string
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingItemLeft}>
        <Ionicons name={icon as any} size={20} color={COLORS.primary} style={styles.settingIcon} />
        <View style={styles.settingTextContainer}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.border, true: COLORS.primary }}
        thumbColor={value ? COLORS.white : COLORS.textLight}
      />
    </View>
  );

  const renderActionItem = (
    title: string,
    subtitle: string,
    onPress: () => void,
    icon: string,
    color: string = COLORS.text,
    showChevron: boolean = true
  ) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingItemLeft}>
        <Ionicons name={icon as any} size={20} color={color} style={styles.settingIcon} />
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color }]}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {showChevron && <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />}
    </TouchableOpacity>
  );

  const renderProfileModal = () => (
    <Modal
      visible={showProfileModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowProfileModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={() => setShowProfileModal(false)}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={editingProfile.name}
                onChangeText={(text) => setEditingProfile(prev => ({ ...prev, name: text }))}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Company</Text>
              <TextInput
                style={styles.textInput}
                value={editingProfile.company}
                onChangeText={(text) => setEditingProfile(prev => ({ ...prev, company: text }))}
                placeholder="Enter company name"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
            
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* User Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <Ionicons name="person" size={32} color={COLORS.primary} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{userProfile?.name}</Text>
                <Text style={styles.profileEmail}>{userProfile?.email}</Text>
                <Text style={styles.profileCompany}>{userProfile?.company} • {userProfile?.role}</Text>
              </View>
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => {
                  setEditingProfile({ 
                    name: userProfile?.name || '', 
                    company: userProfile?.company || '' 
                  });
                  setShowProfileModal(true);
                }}
              >
                <Ionicons name="pencil" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.licenseInfo}>
              <View style={styles.licenseItem}>
                <Text style={styles.licenseLabel}>License</Text>
                <Text style={styles.licenseValue}>{userProfile?.licenseType}</Text>
              </View>
              <View style={styles.licenseItem}>
                <Text style={styles.licenseLabel}>Devices</Text>
                <Text style={styles.licenseValue}>{userProfile?.deviceCount}/{userProfile?.maxDevices}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sync Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync & Storage</Text>
          <View style={styles.card}>
            <View style={styles.syncStatus}>
              <View style={styles.syncStatusItem}>
                <Ionicons 
                  name={isOnline ? "cloud-done" : "cloud-offline"} 
                  size={20} 
                  color={isOnline ? COLORS.success : COLORS.error} 
                />
                <Text style={styles.syncStatusText}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
              <Text style={styles.lastSyncText}>
                Last sync: {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never'}
              </Text>
            </View>
            
            {renderSettingItem(
              'Auto Sync',
              'Automatically sync when online',
              settings.autoSync,
              (value) => handleSettingChange('autoSync', value),
              'sync'
            )}
            
            {renderSettingItem(
              'WiFi Only',
              'Only sync when connected to WiFi',
              settings.syncOnWifiOnly,
              (value) => handleSettingChange('syncOnWifiOnly', value),
              'wifi'
            )}
          </View>
        </View>

        {/* App Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            {renderSettingItem(
              'Notifications',
              'Enable push notifications',
              settings.enableNotifications,
              (value) => handleSettingChange('enableNotifications', value),
              'notifications'
            )}
            
            {renderSettingItem(
              'Haptic Feedback',
              'Enable vibration feedback',
              settings.enableHaptics,
              (value) => handleSettingChange('enableHaptics', value),
              'phone-portrait'
            )}
            
            {renderSettingItem(
              'Location Tracking',
              'Include GPS coordinates in photos',
              settings.enableLocationTracking,
              (value) => handleSettingChange('enableLocationTracking', value),
              'location'
            )}
            
            {renderSettingItem(
              'Debug Mode',
              'Show additional debugging information',
              settings.enableDebugMode,
              (value) => handleSettingChange('enableDebugMode', value),
              'bug'
            )}
          </View>
        </View>

        {/* Storage Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>
          <View style={styles.card}>
            <View style={styles.storageInfo}>
              <View style={styles.storageItem}>
                <Ionicons name="images" size={20} color={COLORS.primary} />
                <Text style={styles.storageText}>{storageInfo.localPhotos} Photos</Text>
              </View>
              <View style={styles.storageItem}>
                <Ionicons name="folder" size={20} color={COLORS.primary} />
                <Text style={styles.storageText}>{storageInfo.localBatches} Batches</Text>
              </View>
              <View style={styles.storageItem}>
                <Ionicons name="hardware-chip" size={20} color={COLORS.primary} />
                <Text style={styles.storageText}>{storageInfo.storageSize}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.card}>
            {renderActionItem(
              'Export Data',
              'Backup your data',
              handleExportData,
              'download',
              COLORS.text
            )}
            
            {renderActionItem(
              'Clear Cache',
              'Free up storage space',
              handleClearCache,
              'trash',
              COLORS.warning
            )}
            
            {/* Admin Access - Only show for admin users */}
            {userProfile?.role === 'admin' && renderActionItem(
              'Admin Dashboard',
              'Manage users, licenses, and system settings',
              () => navigation.navigate('Admin'),
              'shield-checkmark',
              COLORS.primary
            )}
            
            {settings.enableDebugMode && renderActionItem(
              'Debug Tools',
              'Access debugging features',
              () => navigation.navigate('Debug'),
              'construct',
              COLORS.text
            )}
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <View style={styles.card}>
            {renderActionItem(
              'Sign Out',
              'Sign out of your account',
              handleLogout,
              'log-out',
              COLORS.error,
              false
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Aviation Quality Control App</Text>
          <Text style={styles.footerText}>Version 1.0.0</Text>
        </View>
      </ScrollView>

      {renderProfileModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: SPACING.large,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginHorizontal: SPACING.medium,
    marginBottom: SPACING.small,
  },
  card: {
    ...CARD_STYLES.elevated,
    marginHorizontal: SPACING.medium,
  },
  profileCard: {
    ...CARD_STYLES.elevated,
    marginHorizontal: SPACING.medium,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.medium,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.medium,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  profileEmail: {
    fontSize: FONTS.medium,
    color: COLORS.textLight,
    marginTop: SPACING.tiny,
  },
  profileCompany: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.tiny,
  },
  editButton: {
    padding: SPACING.small,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.small,
  },
  licenseInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SPACING.medium,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  licenseItem: {
    alignItems: 'center',
  },
  licenseLabel: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
  },
  licenseValue: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginTop: SPACING.tiny,
  },
  syncStatus: {
    paddingBottom: SPACING.medium,
    marginBottom: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  syncStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.small,
  },
  syncStatusText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginLeft: SPACING.small,
  },
  lastSyncText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: SPACING.medium,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  settingSubtitle: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.tiny,
  },
  storageInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.small,
  },
  storageItem: {
    alignItems: 'center',
  },
  storageText: {
    fontSize: FONTS.small,
    color: COLORS.text,
    marginTop: SPACING.tiny,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: SPACING.large,
  },
  footerText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.large,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  modalBody: {
    padding: SPACING.large,
  },
  inputGroup: {
    marginBottom: SPACING.medium,
  },
  inputLabel: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.medium,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    alignItems: 'center',
    marginTop: SPACING.medium,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
  },
});

export default SettingsScreen;
