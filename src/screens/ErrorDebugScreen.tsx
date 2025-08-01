import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  SafeAreaView,
  TextInput,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../styles/theme';
import { errorLogger, ErrorLogEntry } from '../utils/errorLogger';

const ErrorDebugScreen: React.FC = () => {
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [filteredErrors, setFilteredErrors] = useState<ErrorLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  useEffect(() => {
    loadErrors();
  }, []);

  useEffect(() => {
    filterErrors();
  }, [errors, searchQuery, selectedCategory, selectedSeverity, showResolved]);

  const loadErrors = () => {
    setRefreshing(true);
    try {
      const recentErrors = errorLogger.getRecentErrors(200);
      setErrors(recentErrors);
    } catch (error) {
      console.error('Failed to load errors:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const filterErrors = () => {
    let filtered = [...errors];

    // Filter by resolved status
    if (!showResolved) {
      filtered = filtered.filter(error => !error.resolved);
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(error => error.category === selectedCategory);
    }

    // Filter by severity
    if (selectedSeverity !== 'all') {
      filtered = filtered.filter(error => error.severity === selectedSeverity);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(error => 
        error.error.message.toLowerCase().includes(query) ||
        error.error.name.toLowerCase().includes(query) ||
        error.category.toLowerCase().includes(query) ||
        JSON.stringify(error.context).toLowerCase().includes(query)
      );
    }

    setFilteredErrors(filtered);
  };

  const clearAllErrors = () => {
    Alert.alert(
      'Clear All Errors',
      'This will permanently delete all error logs. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            errorLogger.clearErrors();
            loadErrors();
          }
        }
      ]
    );
  };

  const markErrorResolved = (errorId: string) => {
    errorLogger.markErrorResolved(errorId);
    loadErrors();
  };

  const dumpErrorsToConsole = () => {
    errorLogger.dumpErrorsToConsole();
    Alert.alert('Errors Dumped', 'All errors have been logged to the console. Check your logs.');
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return COLORS.error;
      case 'high': return COLORS.warning;
      case 'medium': return COLORS.info;
      default: return COLORS.textSecondary;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return 'warning';
      case 'high': return 'alert-circle';
      case 'medium': return 'information-circle';
      default: return 'help-circle';
    }
  };

  const categories = ['all', ...Array.from(new Set(errors.map(e => e.category)))];
  const severities = ['all', 'critical', 'high', 'medium', 'low'];

  const stats = errorLogger.getErrorStats();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Error Debug Console</Text>
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            Total: {stats.total} | Unresolved: {stats.unresolved}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search errors..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Category:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {categories.map(category => (
                <TouchableOpacity
                  key={category}
                  style={[
                    styles.filterButton,
                    selectedCategory === category && styles.filterButtonActive
                  ]}
                  onPress={() => setSelectedCategory(category)}
                >
                  <Text style={[
                    styles.filterButtonText,
                    selectedCategory === category && styles.filterButtonTextActive
                  ]}>
                    {category}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.filterRow}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Severity:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {severities.map(severity => (
                <TouchableOpacity
                  key={severity}
                  style={[
                    styles.filterButton,
                    selectedSeverity === severity && styles.filterButtonActive
                  ]}
                  onPress={() => setSelectedSeverity(severity)}
                >
                  <Text style={[
                    styles.filterButtonText,
                    selectedSeverity === severity && styles.filterButtonTextActive
                  ]}>
                    {severity}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Show Resolved</Text>
          <Switch
            value={showResolved}
            onValueChange={setShowResolved}
            trackColor={{ false: COLORS.grey300, true: COLORS.primaryLight }}
            thumbColor={showResolved ? COLORS.primary : COLORS.grey100}
          />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity onPress={loadErrors} style={styles.actionButton}>
          <Ionicons name="refresh" size={16} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Refresh</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={dumpErrorsToConsole} style={styles.actionButton}>
          <Ionicons name="terminal" size={16} color={COLORS.info} />
          <Text style={styles.actionButtonText}>Dump to Console</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={clearAllErrors} style={styles.actionButton}>
          <Ionicons name="trash" size={16} color={COLORS.error} />
          <Text style={styles.actionButtonText}>Clear All</Text>
        </TouchableOpacity>
      </View>

      {/* Error List */}
      <ScrollView
        style={styles.errorList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadErrors} />
        }
      >
        {filteredErrors.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
            <Text style={styles.emptyStateText}>
              {errors.length === 0 ? 'No errors logged yet' : 'No errors match your filters'}
            </Text>
          </View>
        ) : (
          filteredErrors.map((error, index) => (
            <View key={error.id} style={styles.errorCard}>
              <TouchableOpacity
                onPress={() => setExpandedError(expandedError === error.id ? null : error.id)}
                style={styles.errorHeader}
              >
                <View style={styles.errorHeaderLeft}>
                  <Ionicons
                    name={getSeverityIcon(error.severity)}
                    size={20}
                    color={getSeverityColor(error.severity)}
                  />
                  <View style={styles.errorTitleContainer}>
                    <Text style={styles.errorTitle}>{error.error.name}</Text>
                    <Text style={styles.errorCategory}>{error.category}</Text>
                  </View>
                </View>
                <View style={styles.errorHeaderRight}>
                  <Text style={styles.errorTime}>
                    {new Date(error.timestamp).toLocaleTimeString()}
                  </Text>
                  <Ionicons
                    name={expandedError === error.id ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={COLORS.textSecondary}
                  />
                </View>
              </TouchableOpacity>

              <Text style={styles.errorMessage} numberOfLines={2}>
                {error.error.message}
              </Text>

              {expandedError === error.id && (
                <View style={styles.errorDetails}>
                  <Text style={styles.detailsTitle}>Full Message:</Text>
                  <Text style={styles.detailsText}>{error.error.message}</Text>

                  {error.context && Object.keys(error.context).length > 0 && (
                    <>
                      <Text style={styles.detailsTitle}>Context:</Text>
                      <Text style={styles.detailsText}>
                        {JSON.stringify(error.context, null, 2)}
                      </Text>
                    </>
                  )}

                  {error.error.stack && (
                    <>
                      <Text style={styles.detailsTitle}>Stack Trace:</Text>
                      <Text style={styles.detailsText}>{error.error.stack}</Text>
                    </>
                  )}

                  <View style={styles.errorActions}>
                    {!error.resolved && (
                      <TouchableOpacity
                        onPress={() => markErrorResolved(error.id)}
                        style={styles.resolveButton}
                      >
                        <Text style={styles.resolveButtonText}>Mark Resolved</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {error.resolved && (
                <View style={styles.resolvedBadge}>
                  <Text style={styles.resolvedBadgeText}>✓ Resolved</Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
  },
  header: {
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grey200,
  },
  title: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsText: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
  },
  controls: {
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grey200,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grey50,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.sm,
    fontSize: FONTS.regular,
    color: COLORS.text,
  },
  filterRow: {
    marginBottom: SPACING.sm,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: FONTS.small,
    color: COLORS.text,
    marginRight: SPACING.sm,
    minWidth: 60,
  },
  filterButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.xs,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterButtonText: {
    fontSize: FONTS.small,
    color: COLORS.text,
  },
  filterButtonTextActive: {
    color: COLORS.white,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: FONTS.regular,
    color: COLORS.text,
  },
  actions: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grey200,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.md,
  },
  actionButtonText: {
    fontSize: FONTS.small,
    marginLeft: SPACING.xs,
    color: COLORS.text,
  },
  errorList: {
    flex: 1,
    padding: SPACING.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyStateText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  errorCard: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.grey300,
  },
  errorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  errorHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  errorTitleContainer: {
    marginLeft: SPACING.sm,
    flex: 1,
  },
  errorTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.mediumWeight,
    color: COLORS.text,
  },
  errorCategory: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
  },
  errorHeaderRight: {
    alignItems: 'flex-end',
  },
  errorTime: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  errorMessage: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  errorDetails: {
    borderTopWidth: 1,
    borderTopColor: COLORS.grey200,
    paddingTop: SPACING.md,
  },
  detailsTitle: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  detailsText: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  errorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.md,
  },
  resolveButton: {
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  resolveButtonText: {
    fontSize: FONTS.small,
    color: COLORS.white,
    fontWeight: FONTS.mediumWeight,
  },
  resolvedBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.grey100,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  resolvedBadgeText: {
    fontSize: FONTS.small,
    color: COLORS.success,
    fontWeight: FONTS.mediumWeight,
  },
});

export default ErrorDebugScreen; 