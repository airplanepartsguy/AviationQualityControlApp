import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, CARD_STYLES } from '../styles/theme';
// import { getAvailableERPIntegrations, type ERPIntegrationAvailability } from '../services/erpIntegrationPermissionsService';
// import companyIntegrationsService from '../services/companyIntegrationsService';
import { useCallback } from 'react';

interface ERPIntegrationStatus {
  salesforce: {
    available: boolean;
    connected: boolean;
    isPrimary: boolean;
    lastSync?: string;
    status: 'active' | 'inactive' | 'error' | 'pending';
  };
  sharepoint: {
    available: boolean;
    connected: boolean;
    isPrimary: boolean;
    lastSync?: string;
    status: 'active' | 'inactive' | 'error' | 'pending';
  };
  sap: {
    available: boolean;
    connected: boolean;
    isPrimary: boolean;
    lastSync?: string;
    status: 'active' | 'inactive' | 'error' | 'pending';
  };
  dynamics: {
    available: boolean;
    connected: boolean;
    isPrimary: boolean;
    lastSync?: string;
    status: 'active' | 'inactive' | 'error' | 'pending';
  };
}

const ERPScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<ERPIntegrationStatus>({
    salesforce: { available: false, connected: false, isPrimary: false, status: 'inactive' },
    sharepoint: { available: false, connected: false, isPrimary: false, status: 'inactive' },
    sap: { available: false, connected: false, isPrimary: false, status: 'inactive' },
    dynamics: { available: false, connected: false, isPrimary: false, status: 'inactive' },
  });

  const loadERPData = async () => {
    try {
      if (!currentCompany?.id) {
        console.warn('[ERPScreen] No company selected, skipping ERP data load');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      console.log('[ERPScreen] Loading ERP data for company:', currentCompany.id);
      
      // Simulate loading ERP data - simplified version
      const updatedStatus: ERPIntegrationStatus = {
        salesforce: {
          available: true,
          connected: false,
          isPrimary: true,
          status: 'inactive',
        },
        sharepoint: {
          available: false,
          connected: false,
          isPrimary: false,
          status: 'inactive',
        },
        sap: {
          available: false,
          connected: false,
          isPrimary: false,
          status: 'inactive',
        },
        dynamics: {
          available: false,
          connected: false,
          isPrimary: false,
          status: 'inactive',
        },
      };

      setIntegrationStatus(updatedStatus);
    } catch (error) {
      console.error('[ERPScreen] Error loading ERP data:', error);
      Alert.alert('Error', 'Failed to load ERP integration data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadERPData();
  }, [currentCompany?.id]);

  // Refresh data when screen comes into focus (e.g., returning from Salesforce config)
  useFocusEffect(
    useCallback(() => {
      if (currentCompany?.id) {
        console.log('[ERPScreen] Screen focused, refreshing ERP data...');
        loadERPData();
      }
    }, [currentCompany?.id])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadERPData();
  };

  const handleConfigureIntegration = (integrationType: string) => {
    switch (integrationType) {
      case 'salesforce':
        navigation.navigate('SalesforceConfig' as never);
        break;
      case 'sharepoint':
        Alert.alert('SharePoint', 'SharePoint configuration coming soon');
        break;
      default:
        Alert.alert('Coming Soon', `${integrationType} integration is not yet available`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return COLORS.success;
      case 'error': return COLORS.error;
      case 'pending': return COLORS.warning;
      default: return COLORS.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return 'checkmark-circle';
      case 'error': return 'alert-circle';
      case 'pending': return 'time';
      default: return 'ellipse-outline';
    }
  };

  const renderIntegrationCard = (
    type: keyof ERPIntegrationStatus,
    title: string,
    description: string,
    iconName: string
  ) => {
    const integration = integrationStatus[type];
    const isAvailable = integration.available;
    const isConnected = integration.connected;

    return (
      <TouchableOpacity
        key={type}
        style={[
          styles.card,
          integration.isPrimary && styles.primaryCard,
          !isAvailable && styles.disabledCard
        ]}
        onPress={() => isAvailable ? handleConfigureIntegration(type) : null}
        disabled={!isAvailable}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.cardIcon, !isAvailable && { backgroundColor: COLORS.grey200 }]}>
            <Ionicons name={iconName as any} size={24} color={isAvailable ? COLORS.primary : COLORS.textSecondary} />
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, !isAvailable && styles.disabledText]}>
                {title}
              </Text>
              {integration.isPrimary && (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                </View>
              )}
              {!isAvailable && (
                <Ionicons name="lock-closed" size={20} color={COLORS.textSecondary} />
              )}
            </View>
            <Text style={[styles.cardDescription, !isAvailable && styles.disabledText]}>
              {description}
            </Text>
          </View>
          <View style={styles.statusContainer}>
            <Ionicons 
              name={getStatusIcon(integration.status)} 
              size={24} 
              color={getStatusColor(integration.status)} 
            />
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.statusText, { color: getStatusColor(integration.status) }]}>
            {isConnected ? 'Connected' : isAvailable ? 'Not Connected' : 'Not Available in your license'}
          </Text>
          {isAvailable && (
            <Text style={styles.configureText}>Tap to configure</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading ERP integrations...</Text>
      </SafeAreaView>
    );
  }

  if (!currentCompany) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Ionicons name="business-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.errorTitle}>No Company Selected</Text>
        <Text style={styles.errorText}>Please select a company to view ERP integrations</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>ERP Integration</Text>
          <Text style={styles.subtitle}>
            ERP Integrations{'\n'}Connect your quality control data with enterprise systems
          </Text>
        </View>

        <View style={styles.companyInfo}>
          <Text style={styles.companyName}>{currentCompany.name}</Text>
          <Text style={styles.companyCode}>Company Code: {currentCompany.code}</Text>
        </View>

        <View style={styles.integrationsContainer}>
          {renderIntegrationCard(
            'salesforce',
            'Salesforce (AvSight)',
            'Sync batches and photos with Salesforce CRM',
            'cloud-outline'
          )}
          
          {renderIntegrationCard(
            'sharepoint',
            'Microsoft SharePoint',
            'Store and organize files in SharePoint',
            'folder-outline'
          )}
          
          {renderIntegrationCard(
            'sap',
            'SAP',
            'Not available in your license',
            'business-outline'
          )}
          
          {renderIntegrationCard(
            'dynamics',
            'Microsoft Dynamics',
            'Not available in your license',
            'people-outline'
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Need additional integrations? Contact support to upgrade your license.
          </Text>
        </View>

        {/* Add padding at bottom for better scrolling */}
        <View style={{ height: 100 }} />
      </ScrollView>
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
    backgroundColor: COLORS.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
    padding: SPACING.xl,
  },
  errorTitle: {
    fontSize: FONTS.xLarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  errorText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  header: {
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: FONTS.xxLarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  companyInfo: {
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
    marginBottom: SPACING.sm,
  },
  companyName: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  companyCode: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  integrationsContainer: {
    padding: SPACING.lg,
  },
  card: {
    ...CARD_STYLES.elevated,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  primaryCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  disabledCard: {
    opacity: 0.6,
    backgroundColor: COLORS.grey100,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  cardInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  cardTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  primaryBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: SPACING.sm,
  },
  primaryBadgeText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  cardDescription: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  disabledText: {
    color: COLORS.textSecondary,
  },
  statusContainer: {
    marginLeft: SPACING.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.mediumWeight,
  },
  configureText: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
  },
  footer: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default ERPScreen;
