import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompany } from '../contexts/CompanyContext';
import { Company } from '../services/companyService';
import { COLORS, FONTS, SPACING } from '../constants/theme';

/**
 * Company Selection Screen - Multi-Tenant Company Switching
 * Allows users to switch between companies they have access to
 */

interface CompanySelectionScreenProps {
  navigation: any;
}

const CompanySelectionScreen: React.FC<CompanySelectionScreenProps> = ({ navigation }) => {
  const {
    currentCompany,
    userCompanies,
    isLoading,
    isLoadingCompanies,
    switchCompany,
    refreshCompanies
  } = useCompany();

  const [refreshing, setRefreshing] = useState(false);

  /**
   * Handle company selection
   */
  const handleCompanySelect = async (company: Company) => {
    if (company.id === currentCompany?.id) {
      // Already selected, just go back
      navigation.goBack();
      return;
    }

    const success = await switchCompany(company.id);
    if (success) {
      Alert.alert(
        'Company Switched',
        `You are now working with ${company.name}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert(
        'Error',
        'Failed to switch company. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Handle refresh
   */
  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshCompanies();
    setRefreshing(false);
  };

  /**
   * Render company item
   */
  const renderCompanyItem = ({ item }: { item: Company }) => {
    const isSelected = item.id === currentCompany?.id;
    const subscription = item.subscription;
    
    return (
      <TouchableOpacity
        style={[
          styles.companyItem,
          isSelected && styles.selectedCompanyItem
        ]}
        onPress={() => handleCompanySelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.companyHeader}>
          <View style={styles.companyInfo}>
            <Text style={[
              styles.companyName,
              isSelected && styles.selectedText
            ]}>
              {item.name}
            </Text>
            <Text style={[
              styles.companyCode,
              isSelected && styles.selectedSubText
            ]}>
              {item.code} • {item.industry}
            </Text>
          </View>
          
          {isSelected && (
            <Ionicons 
              name="checkmark-circle" 
              size={24} 
              color={COLORS.primary} 
            />
          )}
        </View>

        <View style={styles.companyDetails}>
          <View style={styles.subscriptionBadge}>
            <Text style={styles.subscriptionText}>
              {subscription.plan.toUpperCase()}
            </Text>
          </View>
          
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusDot,
              { backgroundColor: subscription.status === 'active' ? COLORS.success : COLORS.warning }
            ]} />
            <Text style={styles.statusText}>
              {subscription.status}
            </Text>
          </View>
        </View>

        {subscription.expiresAt && (
          <Text style={styles.expiryText}>
            Expires: {new Date(subscription.expiresAt).toLocaleDateString()}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="business-outline" size={64} color={COLORS.textSecondary} />
      <Text style={styles.emptyTitle}>No Companies Found</Text>
      <Text style={styles.emptySubtitle}>
        You don't have access to any companies yet.
      </Text>
      <TouchableOpacity 
        style={styles.refreshButton}
        onPress={handleRefresh}
      >
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoadingCompanies && userCompanies.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading companies...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Company</Text>
        <Text style={styles.subtitle}>
          Choose which company you want to work with
        </Text>
      </View>

      <FlatList
        data={userCompanies}
        renderItem={renderCompanyItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      {currentCompany && (
        <View style={styles.currentCompanyFooter}>
          <Text style={styles.currentCompanyText}>
            Currently working with: {currentCompany.name}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
  },
  listContainer: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  companyItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  selectedCompanyItem: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  companyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  companyCode: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  selectedText: {
    color: COLORS.primary,
  },
  selectedSubText: {
    color: COLORS.primary,
    opacity: 0.8,
  },
  companyDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  subscriptionBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
  },
  subscriptionText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.white,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.xs,
  },
  statusText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  expiryText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  refreshButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  currentCompanyFooter: {
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  currentCompanyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default CompanySelectionScreen;
