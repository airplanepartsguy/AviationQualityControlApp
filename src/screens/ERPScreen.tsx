import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  SafeAreaView,
  ActivityIndicator,
  Button
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, CARD_STYLES } from '../styles/theme';
import * as databaseService from '../services/databaseService';
import * as sharepointService from '../services/sharepointService';
import companyIntegrationsService from '../services/companyIntegrationsService';

interface ERPConnection {
  id: string;
  name: string;
  type: 'SharePoint' | 'Salesforce' | 'SAP' | 'Oracle';
  status: 'connected' | 'disconnected' | 'error' | 'authenticating';
  lastSync: string | null;
  enabled: boolean;
}

const ERPScreen: React.FC = () => {
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  const navigation = useNavigation();
  const [connections, setConnections] = useState<ERPConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sharepointStats, setSharepointStats] = useState({
    totalUploads: 0,
    successfulUploads: 0,
    failedUploads: 0,
    pendingUploads: 0
  });

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      setIsLoading(true);
      
      if (!currentCompany?.id) {
        console.log('[ERPScreen] No current company, skipping integration load');
        setIsLoading(false);
        return;
      }
      
      // Load SharePoint connections
      const spConnections = await sharepointService.getSharePointConnections();
      const mappedConnections: ERPConnection[] = spConnections.map(conn => ({
        id: conn.id,
        name: conn.name,
        type: 'SharePoint' as const,
        status: conn.status,
        lastSync: conn.lastSync,
        enabled: conn.enabled
      }));

      // Load real Salesforce integration status
      const salesforceIntegration = await companyIntegrationsService.getIntegration(currentCompany.id, 'salesforce');
      const salesforceConnection: ERPConnection = {
        id: salesforceIntegration?.id || 'salesforce_1',
        name: 'Salesforce CRM',
        type: 'Salesforce',
        status: salesforceIntegration?.status === 'active' ? 'connected' : 
                salesforceIntegration?.status === 'error' ? 'error' : 'disconnected',
        lastSync: salesforceIntegration?.last_test_at || null,
        enabled: salesforceIntegration?.status === 'active'
      };

      // Add dummy connections for other ERP systems (to be implemented later)
      const otherConnections: ERPConnection[] = [
        {
          id: 'sap_1',
          name: 'SAP ERP',
          type: 'SAP',
          status: 'disconnected',
          lastSync: '2025-01-13T10:30:00Z',
          enabled: false
        }
      ];

      setConnections([...mappedConnections, salesforceConnection, ...otherConnections]);
      
      // Load SharePoint statistics if we have connections
      if (mappedConnections.length > 0) {
        const stats = await sharepointService.getSharePointStats(mappedConnections[0].id);
        setSharepointStats(stats);
      }
      
    } catch (error) {
      console.error('Failed to load connections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    try {
      // Sync SharePoint connections
      const sharePointConnections = connections.filter(conn => conn.type === 'SharePoint' && conn.enabled);
      for (const connection of sharePointConnections) {
        if (connection.status === 'connected') {
          await sharepointService.queueBatchForSharePoint(connection.id, 'all_pending');
        }
      }
      
      // Update stats after sync
      await loadERPStats();
      
      Alert.alert('Success', 'ERP data synchronized successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      Alert.alert('Error', 'Failed to synchronize ERP data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigureSharePoint = () => {
    navigation.navigate('SharePointConfig' as never);
  };

  const handleConfigureSalesforce = () => {
    navigation.navigate('SalesforceConfig' as never);
  };

  const [stats, setStats] = useState({ orders: 0, inventory: 0, synced: 0 });

  useEffect(() => {
    loadERPStats();
  }, []);

  const loadERPStats = async () => {
    if (!user?.id) return;
    
    try {
      const batches = await databaseService.getAllPhotoBatchesForUser(user.id);
      const orders = batches.filter(b => b.type === 'Order').length;
      const inventory = batches.filter(b => b.type === 'Inventory').length;
      const synced = batches.filter(b => b.syncStatus === 'synced').length;
      
      setStats({ orders, inventory, synced });
    } catch (error) {
      console.error('Error loading ERP stats:', error);
    }
  };

  const handleConnectionToggle = (connectionId: string, enabled: boolean) => {
    setConnections(prev => prev.map(conn => 
      conn.id === connectionId ? { ...conn, enabled } : conn
    ));
  };

  const handleTestConnection = async (connection: ERPConnection) => {
    try {
      if (connection.type === 'SharePoint') {
        const success = await sharepointService.testSharePointConnection(connection.id);
        const updatedConnections = connections.map(conn => 
          conn.id === connection.id 
            ? { ...conn, status: success ? 'connected' as const : 'error' as const, lastSync: success ? new Date().toISOString() : conn.lastSync }
            : conn
        );
        setConnections(updatedConnections);
      } else if (connection.type === 'Salesforce') {
        if (!currentCompany?.id) {
          Alert.alert('Error', 'No company selected');
          return;
        }
        
        // Test Salesforce connection using the integration service
        const success = await companyIntegrationsService.testIntegration(connection.id, 'salesforce');
        const updatedConnections = connections.map(conn => 
          conn.id === connection.id 
            ? { ...conn, status: success ? 'connected' as const : 'error' as const, lastSync: success ? new Date().toISOString() : conn.lastSync }
            : conn
        );
        setConnections(updatedConnections);
        
        Alert.alert(
          success ? 'Success' : 'Error', 
          success ? 'Salesforce connection test successful!' : 'Salesforce connection test failed. Please check your configuration.'
        );
      } else {
        // Simulate connection test for other ERP systems
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const updatedConnections = connections.map(conn => 
          conn.id === connection.id 
            ? { ...conn, status: 'connected' as const, lastSync: new Date().toISOString() }
            : conn
        );
        setConnections(updatedConnections);
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      const updatedConnections = connections.map(conn => 
        conn.id === connection.id 
          ? { ...conn, status: 'error' as const }
          : conn
      );
      setConnections(updatedConnections);
      
      if (connection.type === 'Salesforce') {
        Alert.alert('Error', 'Salesforce connection test failed. Please check your configuration.');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return COLORS.success;
      case 'error': return COLORS.error;
      default: return COLORS.textLight;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return 'checkmark-circle';
      case 'error': return 'alert-circle';
      default: return 'ellipse-outline';
    }
  };

  const renderConnection = (connection: ERPConnection) => (
    <View key={connection.id} style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <View style={styles.connectionInfo}>
          <View style={styles.connectionTitleRow}>
            <Text style={styles.connectionName}>{connection.name}</Text>
            <View style={styles.statusContainer}>
              <Ionicons 
                name={getStatusIcon(connection.status)} 
                size={16} 
                color={getStatusColor(connection.status)} 
              />
              <Text style={[styles.statusText, { color: getStatusColor(connection.status) }]}>
                {connection.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.connectionType}>{connection.type}</Text>
          {connection.lastSync && (
            <Text style={styles.lastSync}>
              Last sync: {new Date(connection.lastSync).toLocaleString()}
            </Text>
          )}
        </View>
        <Switch
          value={connection.enabled}
          onValueChange={(enabled) => handleConnectionToggle(connection.id, enabled)}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={connection.enabled ? COLORS.white : COLORS.textLight}
        />
      </View>
      
      <View style={styles.connectionActions}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.testButton]}
          onPress={() => handleTestConnection(connection)}
          disabled={isLoading}
        >
          <Ionicons name="flash" size={16} color={COLORS.primary} />
          <Text style={styles.testButtonText}>Test Connection</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.configButton]}
          onPress={() => {
            if (connection.type === 'SharePoint') {
              handleConfigureSharePoint();
            } else if (connection.type === 'Salesforce') {
              handleConfigureSalesforce();
            } else {
              Alert.alert('Info', `${connection.type} configuration coming soon!`);
            }
          }}
        >
          <Ionicons name="settings" size={16} color={COLORS.textLight} />
          <Text style={styles.configButtonText}>Configure</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Stats Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ERP Integration Overview</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Ionicons name="document-text" size={24} color={COLORS.primary} />
              <Text style={styles.statValue}>{stats.orders}</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="cube" size={24} color={COLORS.primary} />
              <Text style={styles.statValue}>{stats.inventory}</Text>
              <Text style={styles.statLabel}>Inventory</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="cloud-done" size={24} color={COLORS.success} />
              <Text style={styles.statValue}>{stats.synced}</Text>
              <Text style={styles.statLabel}>Synced</Text>
            </View>
          </View>
        </View>

        {/* Connections Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ERP Connections</Text>
          {connections.map(renderConnection)}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.quickAction}
              onPress={() => Alert.alert('Info', 'Sync all data with connected ERP systems')}
            >
              <Ionicons name="sync" size={20} color={COLORS.primary} />
              <Text style={styles.quickActionText}>Sync All Data</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.quickAction}
              onPress={() => Alert.alert('Info', 'Import orders from ERP systems')}
            >
        </View>
      </View>
      <Text style={styles.connectionType}>{connection.type}</Text>
      {connection.lastSync && (
        <Text style={styles.lastSync}>
          Last sync: {new Date(connection.lastSync).toLocaleString()}
        </Text>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Testing connection...</Text>
        </View>
      )}
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
    justifyContent: 'space-around',
    ...CARD_STYLES.elevated,
    padding: SPACING.medium,
    marginBottom: SPACING.medium,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: FONTS.xxlarge,
    fontWeight: FONTS.bold,
    color: COLORS.primary,
    marginTop: SPACING.small,
  },
  statLabel: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.small,
  },
  connectionCard: {
    ...CARD_STYLES.elevated,
    padding: SPACING.medium,
    marginBottom: SPACING.medium,
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.medium,
  },
  connectionInfo: {
    flex: 1,
    marginRight: SPACING.medium,
  },
  connectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.small,
  },
  connectionName: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    flex: 1,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: FONTS.small,
    marginLeft: SPACING.small,
    fontWeight: FONTS.semiBold,
  },
  connectionType: {
    fontSize: FONTS.regular,
    color: COLORS.textLight,
    marginBottom: SPACING.small,
  },
  lastSync: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
  },
  connectionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    flex: 0.48,
    justifyContent: 'center',
  },
  testButton: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  testButtonText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.semiBold,
    color: COLORS.primary,
    marginLeft: SPACING.tiny,
  },
  configButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  configButtonText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.semiBold,
    color: COLORS.textLight,
    marginLeft: SPACING.tiny,
  },
  card: {
    ...CARD_STYLES.elevated,
    padding: 0,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  quickActionText: {
    fontSize: FONTS.regular,
    color: COLORS.text,
    flex: 1,
    marginLeft: SPACING.medium,
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
  loadingText: {
    fontSize: FONTS.regular,
    color: COLORS.white,
    marginTop: SPACING.medium,
  },
});

export default ERPScreen;
