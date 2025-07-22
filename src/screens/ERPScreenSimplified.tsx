import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, CARD_STYLES } from '../styles/theme';
import { getAvailableERPIntegrations, type ERPIntegrationAvailability } from '../services/erpIntegrationPermissionsService';
import companyIntegrationsService from '../services/companyIntegrationsService';
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

const ERPScreenSimplified: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erpPermissions, setErpPermissions] = useState<ERPIntegrationAvailability | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<ERPIntegrationStatus | null>(null);

  const loadERPData = async () => {
    if (!currentCompany?.id) {
      console.log('[ERPScreenSimplified] No company selected');
      return;
    }

    try {
      console.log('[ERPScreenSimplified] Loading ERP data for company:', currentCompany.id);
      
      // Load ERP permissions
      const permissions = await getAvailableERPIntegrations(currentCompany.id);
      setErpPermissions(permissions);
      
      // Load integration status
      const integrations = await companyIntegrationsService.getCompanyIntegrations(currentCompany.id);
      
      const status: ERPIntegrationStatus = {
        salesforce: {
          available: permissions.salesforce.enabled,
          connected: integrations.some(i => i.integration_type === 'salesforce' && i.status === 'active'),
          isPrimary: permissions.salesforce.isPrimary,
          status: integrations.find(i => i.integration_type === 'salesforce')?.status as any || 'inactive'
        },
        sharepoint: {
          available: permissions.sharepoint.enabled,
          connected: integrations.some(i => i.integration_type === 'sharepoint' && i.status === 'active'),
          isPrimary: permissions.sharepoint.isPrimary,
          status: integrations.find(i => i.integration_type === 'sharepoint')?.status as any || 'inactive'
        },
        sap: {
          available: permissions.sap.enabled,
          connected: integrations.some(i => i.integration_type === 'sap' && i.status === 'active'),
          isPrimary: permissions.sap.isPrimary,
          status: integrations.find(i => i.integration_type === 'sap')?.status as any || 'inactive'
        },
        dynamics: {
          available: permissions.dynamics.enabled,
          connected: integrations.some(i => i.integration_type === 'dynamics' && i.status === 'active'),
          isPrimary: permissions.dynamics.isPrimary,
          status: integrations.find(i => i.integration_type === 'dynamics')?.status as any || 'inactive'
        }
      };
      
      setIntegrationStatus(status);
      console.log('[ERPScreenSimplified] ERP data loaded successfully');
      
    } catch (error) {
      console.error('[ERPScreenSimplified] Error loading ERP data:', error);
      Alert.alert('Error', 'Failed to load ERP integration data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadERPData();
  }, [currentCompany?.id]);

  // Refresh data when screen comes into focus (e.g., returning from Salesforce config)
  useFocusEffect(
    useCallback(() => {
      if (currentCompany?.id) {
        console.log('[ERPScreenSimplified] Screen focused, refreshing ERP data...');
        loadERPData();
      }
    }, [currentCompany?.id])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadERPData();
    setRefreshing(false);
  };

  const handleConfigureIntegration = (integrationType: string) => {
    switch (integrationType) {
      case 'salesforce':
        navigation.navigate('SalesforceConfig' as never);
        break;
      case 'sharepoint':
        Alert.alert('Coming Soon', 'SharePoint integration is coming soon!');
        break;
      default:
        Alert.alert('Coming Soon', `${integrationType} integration is coming soon!`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return COLORS.success;
      case 'error': return COLORS.error;
      case 'pending': return COLORS.warning;
      default: return COLORS.textLight;
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
    icon: string
  ) => {
    const integration = integrationStatus?.[type];
    if (!integration?.available) return null;

    return (
      <TouchableOpacity
        key={type}
        style={[
          styles.card,
          integration.isPrimary && styles.primaryCard,
          !integration.available && styles.disabledCard
        ]}
        onPress={() => handleConfigureIntegration(type)}
        disabled={!integration.available}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Ionicons name={icon as any} size={20} color={COLORS.primary} />
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, !integration.available && styles.disabledText]}>
                {title}
              </Text>
              {integration.isPrimary && (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                </View>
              )}
            </View>
            <Text style={[styles.cardDescription, !integration.available && styles.disabledText]}>
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
            {integration.connected ? 'Connected' : 'Not Connected'}
          </Text>
          <Text style={styles.configureText}>
            Tap to configure
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading ERP integrations...</Text>
      </View>
    );
  }

  if (!currentCompany) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="business-outline" size={64} color={COLORS.textLight} />
        <Text style={styles.errorTitle}>No Company Selected</Text>
        <Text style={styles.errorText}>
          Please select a company to view ERP integrations.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>ERP Integrations</Text>
        <Text style={styles.subtitle}>
          Connect your enterprise systems for seamless data flow
        </Text>
      </View>

      <View style={styles.companyInfo}>
        <Text style={styles.companyName}>{currentCompany.name}</Text>
        <Text style={styles.companyCode}>Company Code: {currentCompany.code}</Text>
      </View>

      <View style={styles.integrationsContainer}>
        {renderIntegrationCard(
          'salesforce',
          'Salesforce / AvSight',
          'Sync with Salesforce CRM and AvSight',
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
          'Enterprise resource planning integration',
          'business-outline'
        )}
        
        {renderIntegrationCard(
          'dynamics',
          'Microsoft Dynamics',
          'Customer relationship management',
          'people-outline'
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Need additional integrations? Contact support to upgrade your license.
        </Text>
      </View>
    </ScrollView>
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
    fontSize: FONTS.regular,
    color: COLORS.textLight,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.xlarge,
  },
  errorTitle: {
    fontSize: FONTS.xlarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: SPACING.medium,
    marginBottom: SPACING.small,
  },
  errorText: {
    fontSize: FONTS.regular,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  header: {
    padding: SPACING.large,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: FONTS.xxlarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.tiny,
  },
  subtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textLight,
  },
  companyInfo: {
    padding: SPACING.large,
    backgroundColor: COLORS.card,
    marginBottom: SPACING.small,
  },
  companyName: {
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  companyCode: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.tiny,
  },
  integrationsContainer: {
    padding: SPACING.large,
  },
  card: {
    ...CARD_STYLES.elevated,
    marginBottom: SPACING.medium,
    padding: SPACING.large,
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
    marginBottom: SPACING.medium,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.medium,
  },
  cardInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.tiny,
  },
  cardTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  primaryBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.small,
    marginLeft: SPACING.small,
  },
  primaryBadgeText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  cardDescription: {
    fontSize: FONTS.regular,
    color: COLORS.textLight,
  },
  disabledText: {
    color: COLORS.textLight,
  },
  statusContainer: {
    marginLeft: SPACING.small,
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
    color: COLORS.textLight,
  },
  footer: {
    padding: SPACING.large,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default ERPScreenSimplified;
