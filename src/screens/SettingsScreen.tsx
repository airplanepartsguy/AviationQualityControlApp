import React, { useState, useEffect, useCallback } from 'react';
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
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { useCompany } from '../contexts/CompanyContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS, CARD_STYLES } from '../styles/theme';
import { RootStackParamList } from '../types/navigation';
import networkService from '../services/networkService';
import * as databaseService from '../services/databaseService';
import dataResetService from '../services/dataResetService';
import userProfileService from '../services/userProfileService';
import { NavigationService } from '../services/navigationService';

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
  cachePhotos: boolean;
  compressPhotos: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  company?: string;
  role?: string;
  licenseType?: string;
  licensesAssigned?: number;
  maxLicenses?: number;
}

interface StorageInfo {
  localPhotos: number;
  localBatches: number;
  storageSize: string;
  lastCleanup?: string;
}

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { user, logout } = useAuth();
  const { isSyncing, lastSyncTime, syncStats } = useSync();
  const { currentCompany } = useCompany();
  
  const [settings, setSettings] = useState<AppSettings>({
    autoSync: true,
    syncOnWifiOnly: false,
    enableNotifications: true,
    enableHaptics: true,
    enableLocationTracking: true,
    photoQuality: 'high',
    maxPhotosPerBatch: 50,
    enableDebugMode: false,
    cachePhotos: true,
    compressPhotos: false,
  });
  
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    localPhotos: 0,
    localBatches: 0,
    storageSize: '0 MB'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState({ name: '', company: '' });

  // Initialize data
  useEffect(() => {
    initializeSettings();
  }, [user?.id]);

  const initializeSettings = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const [savedSettings, profile, storage] = await Promise.allSettled([
        loadSettings(),
        loadUserProfile(),
        loadStorageInfo(),
      ]);

      if (savedSettings.status === 'fulfilled') {
        setSettings(prev => ({ ...prev, ...savedSettings.value }));
      }

      if (profile.status === 'fulfilled') {
        setUserProfile(profile.value);
      }

      if (storage.status === 'fulfilled') {
        setStorageInfo(storage.value);
      }

    } catch (error) {
      console.error('[Settings] Initialization error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const loadSettings = async (): Promise<Partial<AppSettings>> => {
    try {
      const saved = await AsyncStorage.getItem('app_settings');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('[Settings] Failed to load settings:', error);
      return {};
    }
  };

  const loadUserProfile = async (): Promise<UserProfile | null> => {
    try {
      if (!user?.id) return null;
      return await userProfileService.fetchCompleteUserProfile();
    } catch (error) {
      console.error('[Settings] Failed to load profile:', error);
      return null;
    }
  };

  const loadStorageInfo = async (): Promise<StorageInfo> => {
    try {
      if (!user?.id) return { localPhotos: 0, localBatches: 0, storageSize: '0 MB' };
      
      const batches = await databaseService.getAllPhotoBatchesForUser(user.id);
      const totalPhotos = batches.reduce((sum, batch) => sum + (batch.photoCount || 0), 0);

      const lastCleanup = await AsyncStorage.getItem('last_cleanup');
      return {
        localPhotos: totalPhotos,
        localBatches: batches.length,
        storageSize: `${Math.round((totalPhotos * 0.5) * 100) / 100} MB`, // Rough estimate
        lastCleanup: lastCleanup || undefined,
      };
    } catch (error) {
      console.error('[Settings] Failed to load storage info:', error);
      return { localPhotos: 0, localBatches: 0, storageSize: '0 MB' };
    }
  };

  const handleSettingChange = useCallback(async (key: keyof AppSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    try {
      await AsyncStorage.setItem('app_settings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('[Settings] Failed to save settings:', error);
    }
  }, [settings]);

  const handleProfileUpdate = useCallback(async () => {
    try {
      if (!user?.id) return;
      
      await userProfileService.updateUserProfile({
        name: editingProfile.name,
        company: editingProfile.company,
      });
      
      setUserProfile(prev => prev ? {
        ...prev,
        name: editingProfile.name,
        company: editingProfile.company,
      } : null);
      
      setShowProfileModal(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('[Settings] Profile update error:', error);
      Alert.alert('Error', 'Failed to update profile');
    }
  }, [user?.id, editingProfile]);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear Cache',
      'This will remove all cached photos and temporary files. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await dataResetService.resetAllLocalData();
              await AsyncStorage.setItem('last_cleanup', new Date().toISOString());
              await initializeSettings();
              Alert.alert('Success', 'Cache cleared successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ]
    );
  }, [initializeSettings]);

  const handleExportData = useCallback(() => {
    Alert.alert(
      'Export Data',
      'This feature is coming soon. Your data will be exported to a downloadable file.',
      [{ text: 'OK' }]
    );
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  }, [logout]);

  // Render components
  const renderSectionHeader = (title: string, subtitle?: string) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );

  const renderSettingToggle = (
    title: string,
    subtitle: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    icon: string,
    disabled?: boolean
  ) => (
    <View style={[styles.settingRow, disabled && styles.settingRowDisabled]}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: disabled ? COLORS.grey200 : COLORS.backgroundTertiary }]}>
          <Ionicons 
            name={icon as any} 
            size={20} 
            color={disabled ? COLORS.grey400 : COLORS.primary} 
          />
        </View>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, disabled && styles.settingTitleDisabled]}>
            {title}
          </Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: COLORS.grey300, true: COLORS.primary }}
        thumbColor={value ? COLORS.white : COLORS.white}
        ios_backgroundColor={COLORS.grey300}
      />
    </View>
  );

  const renderSettingAction = (
    title: string,
    subtitle: string,
    onPress: () => void,
    icon: string,
    color: string = COLORS.text,
    rightElement?: React.ReactNode
  ) => (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: COLORS.backgroundTertiary }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, { color }]}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={20} color={COLORS.grey400} />}
    </TouchableOpacity>
  );

  const renderProfileCard = () => (
    <View style={styles.profileCard}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {userProfile?.name || 'User'}
          </Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <Text style={styles.profileCompany}>
            {currentCompany?.name || userProfile?.company || 'No company'} • {userProfile?.role || 'User'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.editProfileButton}
          onPress={() => {
            setEditingProfile({
              name: userProfile?.name || '',
              company: userProfile?.company || '',
            });
            setShowProfileModal(true);
          }}
        >
          <Ionicons name="pencil" size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
      
      {userProfile?.licenseType && (
        <View style={styles.licenseInfo}>
          <View style={styles.licenseItem}>
            <Text style={styles.licenseLabel}>License</Text>
            <Text style={styles.licenseValue}>{userProfile.licenseType}</Text>
          </View>
          {userProfile.maxLicenses && (
            <View style={styles.licenseItem}>
              <Text style={styles.licenseLabel}>Usage</Text>
              <Text style={styles.licenseValue}>
                {userProfile.licensesAssigned || 0} / {userProfile.maxLicenses}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderStorageCard = () => (
    <View style={styles.storageCard}>
      <View style={styles.storageHeader}>
        <Ionicons name="folder" size={24} color={COLORS.primary} />
        <Text style={styles.storageTitle}>Local Storage</Text>
      </View>
      <View style={styles.storageStats}>
        <View style={styles.storageStat}>
          <Text style={styles.storageNumber}>{storageInfo.localPhotos}</Text>
          <Text style={styles.storageLabel}>Photos</Text>
        </View>
        <View style={styles.storageStat}>
          <Text style={styles.storageNumber}>{storageInfo.localBatches}</Text>
          <Text style={styles.storageLabel}>Batches</Text>
        </View>
        <View style={styles.storageStat}>
          <Text style={styles.storageNumber}>{storageInfo.storageSize}</Text>
          <Text style={styles.storageLabel}>Used</Text>
        </View>
      </View>
      {storageInfo.lastCleanup && (
        <Text style={styles.lastCleanup}>
          Last cleanup: {new Date(storageInfo.lastCleanup).toLocaleDateString()}
        </Text>
      )}
    </View>
  );

  const renderSyncStatus = () => (
    <View style={styles.syncCard}>
      <View style={styles.syncHeader}>
        <Ionicons 
          name={isSyncing ? "sync" : "cloud-done"} 
          size={24} 
          color={isSyncing ? COLORS.warning : COLORS.success} 
        />
        <Text style={styles.syncTitle}>
          {isSyncing ? 'Syncing...' : 'Synchronized'}
        </Text>
      </View>
      {lastSyncTime && (
        <Text style={styles.syncSubtitle}>
          Last sync: {new Date(lastSyncTime).toLocaleString()}
        </Text>
      )}
             {syncStats && (
         <Text style={styles.syncStats}>
           {syncStats.completed || 0} completed • {syncStats.failed || 0} failed
         </Text>
       )}
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.section}>
          {renderSectionHeader('Profile', 'Manage your account information')}
          {renderProfileCard()}
        </View>

        {/* Sync Status */}
        <View style={styles.section}>
          {renderSectionHeader('Sync Status')}
          {renderSyncStatus()}
        </View>

        {/* Storage */}
        <View style={styles.section}>
          {renderSectionHeader('Storage', 'Local data and cache information')}
          {renderStorageCard()}
        </View>

        {/* App Preferences */}
        <View style={styles.section}>
          {renderSectionHeader('Preferences', 'Customize your app experience')}
          <View style={styles.card}>
            {renderSettingToggle(
              'Auto Sync',
              'Automatically sync data when online',
              settings.autoSync,
              (value) => handleSettingChange('autoSync', value),
              'sync'
            )}
            {renderSettingToggle(
              'WiFi Only Sync',
              'Only sync when connected to WiFi',
              settings.syncOnWifiOnly,
              (value) => handleSettingChange('syncOnWifiOnly', value),
              'wifi',
              !settings.autoSync
            )}
            {renderSettingToggle(
              'Notifications',
              'Receive push notifications',
              settings.enableNotifications,
              (value) => handleSettingChange('enableNotifications', value),
              'notifications'
            )}
            {renderSettingToggle(
              'Haptic Feedback',
              'Feel vibrations for interactions',
              settings.enableHaptics,
              (value) => handleSettingChange('enableHaptics', value),
              'phone-portrait'
            )}
          </View>
        </View>

        {/* Photo Settings */}
        <View style={styles.section}>
          {renderSectionHeader('Photo Settings', 'Configure photo capture and storage')}
          <View style={styles.card}>
            {renderSettingAction(
              'Photo Quality',
              `Currently: ${settings.photoQuality}`,
              () => {
                // Handle photo quality selection
                Alert.alert('Photo Quality', 'Quality selection coming soon');
              },
              'camera',
              COLORS.text,
              <Text style={styles.settingValue}>{settings.photoQuality}</Text>
            )}
            {renderSettingToggle(
              'Cache Photos',
              'Keep local copies for faster access',
              settings.cachePhotos,
              (value) => handleSettingChange('cachePhotos', value),
              'images'
            )}
            {renderSettingToggle(
              'Compress Photos',
              'Reduce file size for uploads',
              settings.compressPhotos,
              (value) => handleSettingChange('compressPhotos', value),
              'resize'
            )}
            {renderSettingToggle(
              'Location Tracking',
              'Include GPS coordinates in photos',
              settings.enableLocationTracking,
              (value) => handleSettingChange('enableLocationTracking', value),
              'location'
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          {renderSectionHeader('Actions', 'Data management and tools')}
          <View style={styles.card}>
            {renderSettingAction(
              'Export Data',
              'Backup your photos and batches',
              handleExportData,
              'download-outline',
              COLORS.text
            )}
            {renderSettingAction(
              'Clear Cache',
              'Free up storage space',
              handleClearCache,
              'trash-outline',
              COLORS.warning
            )}
            {userProfile?.role === 'admin' && renderSettingAction(
              'Admin Panel',
              'Manage users and system settings',
              () => navigation.navigate('Admin'),
              'shield-checkmark-outline',
              COLORS.primary
            )}
            {renderSettingAction(
              'Debug Tools',
              'Access debugging features',
              () => navigation.navigate('Debug'),
              'construct-outline',
              COLORS.text
            )}
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <View style={styles.card}>
            {renderSettingAction(
              'Sign Out',
              'Sign out of your account',
              handleLogout,
              'log-out-outline',
              COLORS.error,
              <View />
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Aviation Quality Control App</Text>
          <Text style={styles.footerText}>Version 1.0.0</Text>
          <Text style={styles.footerText}>© 2024 QCPics</Text>
        </View>
      </ScrollView>

      {/* Profile Edit Modal */}
      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowProfileModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleProfileUpdate}>
              <Text style={styles.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={editingProfile.name}
                onChangeText={(text) => setEditingProfile(prev => ({ ...prev, name: text }))}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.grey500}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Company</Text>
              <TextInput
                style={styles.textInput}
                value={editingProfile.company}
                onChangeText={(text) => setEditingProfile(prev => ({ ...prev, company: text }))}
                placeholder="Enter your company"
                placeholderTextColor={COLORS.grey500}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  card: {
    ...CARD_STYLES.default,
    marginHorizontal: SPACING.md,
  },
  
  // Profile Card
  profileCard: {
    ...CARD_STYLES.default,
    marginHorizontal: SPACING.md,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: FONTS.xxLarge,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  profileCompany: {
    fontSize: FONTS.small,
    color: COLORS.textTertiary,
  },
  editProfileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  licenseInfo: {
    flexDirection: 'row',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  licenseItem: {
    flex: 1,
    alignItems: 'center',
  },
  licenseLabel: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  licenseValue: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },

  // Storage Card
  storageCard: {
    ...CARD_STYLES.default,
    marginHorizontal: SPACING.md,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  storageTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  storageStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.sm,
  },
  storageStat: {
    alignItems: 'center',
  },
  storageNumber: {
    fontSize: FONTS.xLarge,
    fontWeight: FONTS.bold,
    color: COLORS.primary,
    marginBottom: 2,
  },
  storageLabel: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
  },
  lastCleanup: {
    fontSize: FONTS.small,
    color: COLORS.textTertiary,
    textAlign: 'center',
  },

  // Sync Card
  syncCard: {
    ...CARD_STYLES.default,
    marginHorizontal: SPACING.md,
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  syncTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  syncSubtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  syncStats: {
    fontSize: FONTS.small,
    color: COLORS.textTertiary,
  },

  // Setting Rows
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  settingRowDisabled: {
    opacity: 0.5,
  },
  settingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.mediumWeight,
    color: COLORS.text,
    marginBottom: 2,
  },
  settingTitleDisabled: {
    color: COLORS.grey500,
  },
  settingSubtitle: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
  },
  settingValue: {
    fontSize: FONTS.regular,
    color: COLORS.primary,
    fontWeight: FONTS.mediumWeight,
    textTransform: 'capitalize',
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalCancel: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  modalTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  modalSave: {
    fontSize: FONTS.regular,
    color: COLORS.primary,
    fontWeight: FONTS.bold,
  },
  modalContent: {
    padding: SPACING.md,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.mediumWeight,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.regular,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  footerText: {
    fontSize: FONTS.small,
    color: COLORS.textTertiary,
    marginBottom: 2,
  },
});

export default SettingsScreen;
