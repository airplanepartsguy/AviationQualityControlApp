import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  FlatList,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import adminService, { UserLicenseInfo, DeviceInfo, AdminStats } from '../services/adminService';

/**
 * Admin Screen - User and License Management Interface
 * Provides admin functionality for managing users, licenses, and device registrations
 * Now uses real Supabase API integration via adminService
 */

const AdminScreen: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserLicenseInfo[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'users' | 'devices' | 'licenses'>('users');
  const [isAdmin, setIsAdmin] = useState(false);

  // Create user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'member'>('member');
  const [newUserLicenseType, setNewUserLicenseType] = useState<'trial' | 'basic' | 'premium' | 'enterprise'>('trial');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      
      // Check if current user is admin
      const adminStatus = await adminService.isCurrentUserAdmin();
      setIsAdmin(adminStatus);
      
      if (!adminStatus) {
        Alert.alert('Access Denied', 'You do not have admin privileges');
        return;
      }
      
      // Load real data from Supabase
      const [usersData, devicesData, statsData] = await Promise.all([
        adminService.getAllUsers(),
        adminService.getAllDevices(),
        adminService.getAdminStats()
      ]);
      
      setUsers(usersData);
      setDevices(devicesData);
      setAdminStats(statsData);
      
      console.log('[Admin] Loaded real data:', {
        users: usersData.length,
        devices: devicesData.length,
        stats: statsData
      });
      
    } catch (error) {
      console.error('[Admin] Error loading admin data:', error);
      Alert.alert('Error', 'Failed to load admin data: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAdminData();
    setRefreshing(false);
  };

  const handleCreateUser = async () => {
    if (!newUserEmail.trim()) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      // Create user via real adminService API
      await adminService.createUser(newUserEmail, newUserRole, newUserLicenseType);
      
      Alert.alert('Success', 'User created successfully');
      setShowCreateUser(false);
      setNewUserEmail('');
      setNewUserRole('member');
      setNewUserLicenseType('trial');
      await loadAdminData();
    } catch (error) {
      console.error('[Admin] Error creating user:', error);
      Alert.alert('Error', 'Failed to create user: ' + (error as Error).message);
    }
  };

  const handleSuspendUser = async (userId: string) => {
    Alert.alert(
      'Suspend User',
      'Are you sure you want to suspend this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            try {
              // Suspend user via real adminService API
              await adminService.suspendUser(userId);
              Alert.alert('Success', 'User suspended successfully');
              await loadAdminData();
            } catch (error) {
              console.error('[Admin] Error suspending user:', error);
              Alert.alert('Error', 'Failed to suspend user: ' + (error as Error).message);
            }
          }
        }
      ]
    );
  };

  const handleRevokeDevice = async (deviceId: string) => {
    Alert.alert(
      'Revoke Device',
      'Are you sure you want to revoke this device registration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              // Revoke device via real adminService API
              await adminService.revokeDevice(deviceId);
              Alert.alert('Success', 'Device revoked successfully');
              await loadAdminData();
            } catch (error) {
              console.error('[Admin] Error revoking device:', error);
              Alert.alert('Error', 'Failed to revoke device: ' + (error as Error).message);
            }
          }
        }
      ]
    );
  };

  const renderUserItem = ({ item }: { item: UserLicenseInfo }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{item.email}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      
      <View style={styles.itemDetails}>
        <Text style={styles.detailText}>License: {item.licenseType.toUpperCase()}</Text>
        <Text style={styles.detailText}>Role: {item.role.toUpperCase()}</Text>
        <Text style={styles.detailText}>Devices: {item.activeDevices}/{item.maxDevices}</Text>
        {item.expiresAt && (
          <Text style={styles.detailText}>
            Expires: {new Date(item.expiresAt).toLocaleDateString()}
          </Text>
        )}
      </View>
      
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.suspendButton]}
          onPress={() => handleSuspendUser(item.userId)}
        >
          <Ionicons name="ban" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>Suspend</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDeviceItem = ({ item }: { item: DeviceInfo }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{item.deviceName}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.isActive ? '#4CAF50' : '#757575' }]}>
          <Text style={styles.statusText}>{item.isActive ? 'ACTIVE' : 'INACTIVE'}</Text>
        </View>
      </View>
      
      <View style={styles.itemDetails}>
        <Text style={styles.detailText}>Type: {item.deviceType}</Text>
        <Text style={styles.detailText}>Platform: {item.platform}</Text>
        <Text style={styles.detailText}>
          Last Active: {new Date(item.lastActiveAt).toLocaleDateString()}
        </Text>
      </View>
      
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.revokeButton]}
          onPress={() => handleRevokeDevice(item.id)}
        >
          <Ionicons name="close-circle" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>Revoke</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#4CAF50';
      case 'expired': return '#FF9800';
      case 'suspended': return '#F44336';
      case 'cancelled': return '#757575';
      default: return '#757575';
    }
  };

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'users':
        return (
          <FlatList
            data={users}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.userId}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No users found</Text>
                <Text style={styles.emptySubtext}>Create your first user to get started</Text>
              </View>
            }
          />
        );
      
      case 'devices':
        return (
          <FlatList
            data={devices}
            renderItem={renderDeviceItem}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="phone-portrait-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No devices found</Text>
                <Text style={styles.emptySubtext}>Device registrations will appear here</Text>
              </View>
            }
          />
        );
      
      case 'licenses':
        return (
          <View style={styles.licenseOverview}>
            <View style={styles.licenseCard}>
              <Text style={styles.licenseTitle}>License Overview</Text>
              <View style={styles.licenseStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{users.filter(u => u.status === 'active').length}</Text>
                  <Text style={styles.statLabel}>Active Users</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{devices.filter(d => d.isActive).length}</Text>
                  <Text style={styles.statLabel}>Active Devices</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{users.filter(u => u.status === 'expired').length}</Text>
                  <Text style={styles.statLabel}>Expired Licenses</Text>
                </View>
              </View>
            </View>
          </View>
        );
      
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowCreateUser(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'users' && styles.activeTab]}
          onPress={() => setSelectedTab('users')}
        >
          <Ionicons name="people" size={20} color={selectedTab === 'users' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, selectedTab === 'users' && styles.activeTabText]}>Users</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'devices' && styles.activeTab]}
          onPress={() => setSelectedTab('devices')}
        >
          <Ionicons name="phone-portrait" size={20} color={selectedTab === 'devices' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, selectedTab === 'devices' && styles.activeTabText]}>Devices</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'licenses' && styles.activeTab]}
          onPress={() => setSelectedTab('licenses')}
        >
          <Ionicons name="key" size={20} color={selectedTab === 'licenses' ? '#007AFF' : '#666'} />
          <Text style={[styles.tabText, selectedTab === 'licenses' && styles.activeTabText]}>Licenses</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {renderTabContent()}
      </View>

      {/* Create User Modal */}
      <Modal
        visible={showCreateUser}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateUser(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create User</Text>
            <TouchableOpacity onPress={handleCreateUser}>
              <Text style={styles.modalSave}>Create</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email Address</Text>
              <TextInput
                style={styles.formInput}
                value={newUserEmail}
                onChangeText={setNewUserEmail}
                placeholder="user@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Role</Text>
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[styles.segment, newUserRole === 'member' && styles.activeSegment]}
                  onPress={() => setNewUserRole('member')}
                >
                  <Text style={[styles.segmentText, newUserRole === 'member' && styles.activeSegmentText]}>
                    Member
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, newUserRole === 'admin' && styles.activeSegment]}
                  onPress={() => setNewUserRole('admin')}
                >
                  <Text style={[styles.segmentText, newUserRole === 'admin' && styles.activeSegmentText]}>
                    Admin
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>License Type</Text>
              <View style={styles.licenseTypeContainer}>
                {(['trial', 'basic', 'premium', 'enterprise'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.licenseTypeOption, newUserLicenseType === type && styles.activeLicenseType]}
                    onPress={() => setNewUserLicenseType(type)}
                  >
                    <Text style={[styles.licenseTypeText, newUserLicenseType === type && styles.activeLicenseTypeText]}>
                      {type.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333'
  },
  addButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    gap: 8
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF'
  },
  tabText: {
    fontSize: 16,
    color: '#666'
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600'
  },
  content: {
    flex: 1,
    padding: 15
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff'
  },
  itemDetails: {
    marginBottom: 15
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2
  },
  itemActions: {
    flexDirection: 'row',
    gap: 10
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4
  },
  suspendButton: {
    backgroundColor: '#F44336'
  },
  revokeButton: {
    backgroundColor: '#FF9800'
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 15
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
    textAlign: 'center'
  },
  licenseOverview: {
    flex: 1
  },
  licenseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  licenseTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20
  },
  licenseStats: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  statItem: {
    alignItems: 'center'
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF'
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 5
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  modalCancel: {
    fontSize: 16,
    color: '#007AFF'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333'
  },
  modalSave: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600'
  },
  modalContent: {
    flex: 1,
    padding: 20
  },
  formGroup: {
    marginBottom: 25
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  formInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6
  },
  activeSegment: {
    backgroundColor: '#007AFF'
  },
  segmentText: {
    fontSize: 16,
    color: '#666'
  },
  activeSegmentText: {
    color: '#fff',
    fontWeight: '600'
  },
  licenseTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  licenseTypeOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff'
  },
  activeLicenseType: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF'
  },
  licenseTypeText: {
    fontSize: 14,
    color: '#666'
  },
  activeLicenseTypeText: {
    color: '#fff',
    fontWeight: '600'
  }
});

export default AdminScreen;
