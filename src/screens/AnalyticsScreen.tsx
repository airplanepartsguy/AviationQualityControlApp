import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator, 
  TouchableOpacity,
  RefreshControl,
  Dimensions
} from 'react-native';
import { AnalyticsTabScreenProps } from '../types/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import { logAnalyticsEvent, getAnalyticsData } from '../services/analyticsService';
import { trackPerformance } from '../utils/performanceMonitor';

const { width: screenWidth } = Dimensions.get('window');

/**
 * AnalyticsScreen Component
 * 
 * A comprehensive analytics dashboard that displays key metrics about the application usage:
 * - Photo capture statistics
 * - Defect severity distribution
 * - Barcode scan success rates
 * - PDF generation metrics
 * - Sync status with Salesforce
 */
const AnalyticsScreen: React.FC<AnalyticsTabScreenProps> = ({ navigation }) => {
  // State for analytics data
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');
  const [analyticsData, setAnalyticsData] = useState<{
    photoStats: {
      total: number;
      withDefects: number;
      withoutDefects: number;
      byDate: { date: string; count: number }[];
    };
    defectStats: {
      critical: number;
      moderate: number;
      minor: number;
    };
    scanStats: {
      total: number;
      successful: number;
      failed: number;
      successRate: number;
    };
    pdfStats: {
      generated: number;
      averageGenerationTime: number;
      shared: number;
    };
    syncStats: {
      attempted: number;
      successful: number;
      failed: number;
      pending: number;
    };
  }>({ 
    photoStats: { total: 0, withDefects: 0, withoutDefects: 0, byDate: [] },
    defectStats: { critical: 0, moderate: 0, minor: 0 },
    scanStats: { total: 0, successful: 0, failed: 0, successRate: 0 },
    pdfStats: { generated: 0, averageGenerationTime: 0, shared: 0 },
    syncStats: { attempted: 0, successful: 0, failed: 0, pending: 0 }
  });

  // Fetch analytics data
  const fetchAnalyticsData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Use performance tracking for analytics data fetch
      await trackPerformance('Fetch Analytics Data', async () => {
        // In a real app, this would fetch from a database
        // For now, we'll use mock data from the analytics service
        const data = await getAnalyticsData(timeRange);
        setAnalyticsData(data);
      });
      
      // Log the analytics view event
      await logAnalyticsEvent('view_analytics', { timeRange });
    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [timeRange]);

  // Refresh data when pulled down
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Fetch data on component mount and when time range changes
  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Chart configuration
  const chartConfig = {
    backgroundGradientFrom: COLORS.white,
    backgroundGradientTo: COLORS.white,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.7,
    useShadowColorFromDataset: false,
    decimalPlaces: 0,
  };

  // Render time range selector
  const renderTimeRangeSelector = () => (
    <View style={styles.timeRangeContainer}>
      <TouchableOpacity 
        style={[styles.timeRangeButton, timeRange === 'day' && styles.selectedTimeRange]}
        onPress={() => setTimeRange('day')}
      >
        <Text style={[styles.timeRangeText, timeRange === 'day' && styles.selectedTimeRangeText]}>Day</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.timeRangeButton, timeRange === 'week' && styles.selectedTimeRange]}
        onPress={() => setTimeRange('week')}
      >
        <Text style={[styles.timeRangeText, timeRange === 'week' && styles.selectedTimeRangeText]}>Week</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.timeRangeButton, timeRange === 'month' && styles.selectedTimeRange]}
        onPress={() => setTimeRange('month')}
      >
        <Text style={[styles.timeRangeText, timeRange === 'month' && styles.selectedTimeRangeText]}>Month</Text>
      </TouchableOpacity>
    </View>
  );

  // Render photo statistics section
  const renderPhotoStats = () => {
    const photoData = {
      labels: analyticsData.photoStats.byDate.map(item => item.date.split('T')[0].substring(5)),
      datasets: [
        {
          data: analyticsData.photoStats.byDate.map(item => item.count)
        }
      ]
    };

    return (
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Photo Capture Statistics</Text>
        <LineChart
          data={photoData}
          width={screenWidth - SPACING.large * 2}
          height={220}
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`
          }}
          bezier
          style={styles.chart}
          yAxisLabel=""
          yAxisSuffix=""
        />
        <Text style={styles.chartTitle}>Photos Captured Over Time</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{analyticsData.photoStats.total}</Text>
            <Text style={styles.statLabel}>Total Photos</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{analyticsData.photoStats.withDefects}</Text>
            <Text style={styles.statLabel}>With Defects</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{analyticsData.photoStats.withoutDefects}</Text>
            <Text style={styles.statLabel}>No Defects</Text>
          </View>
        </View>
      </View>
    );
  };

  // Render defect severity distribution
  const renderDefectStats = () => {
    const defectData = {
      labels: ['Critical', 'Moderate', 'Minor'],
      datasets: [
        {
          data: [
            analyticsData.defectStats.critical,
            analyticsData.defectStats.moderate,
            analyticsData.defectStats.minor
          ]
        }
      ]
    };

    return (
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Defect Severity Distribution</Text>
        <PieChart
          data={[
            {
              name: 'Critical',
              population: analyticsData.defectStats.critical,
              color: '#F44336',
              legendFontColor: COLORS.text,
              legendFontSize: 12
            },
            {
              name: 'Moderate',
              population: analyticsData.defectStats.moderate,
              color: '#FF9800',
              legendFontColor: COLORS.text,
              legendFontSize: 12
            },
            {
              name: 'Minor',
              population: analyticsData.defectStats.minor,
              color: '#FFEB3B',
              legendFontColor: COLORS.text,
              legendFontSize: 12
            }
          ]}
          width={screenWidth - SPACING.large * 2}
          height={220}
          chartConfig={chartConfig}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          absolute
        />
      </View>
    );
  };

  // Render barcode scan statistics
  const renderScanStats = () => (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>Barcode Scan Statistics</Text>
      <BarChart
        data={{
          labels: ['Success', 'Failed'],
          datasets: [{
            data: [analyticsData.scanStats.successful, analyticsData.scanStats.failed]
          }]
        }}
        width={screenWidth - SPACING.large * 2}
        height={220}
        chartConfig={chartConfig}
        style={styles.chart}
        showValuesOnTopOfBars={true}
        yAxisLabel=""
        yAxisSuffix=""
      />
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{analyticsData.scanStats.total}</Text>
          <Text style={styles.statLabel}>Total Scans</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{`${analyticsData.scanStats.successRate}%`}</Text>
          <Text style={styles.statLabel}>Success Rate</Text>
        </View>
      </View>
    </View>
  );

  // Render PDF generation statistics
  const renderPdfStats = () => (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>PDF Generation Statistics</Text>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{analyticsData.pdfStats.generated}</Text>
          <Text style={styles.statLabel}>Generated</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{analyticsData.pdfStats.averageGenerationTime}ms</Text>
          <Text style={styles.statLabel}>Avg. Time</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{analyticsData.pdfStats.shared}</Text>
          <Text style={styles.statLabel}>Shared</Text>
        </View>
      </View>
    </View>
  );

  // Render sync statistics
  const renderSyncStats = () => (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>Salesforce Sync Statistics</Text>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{analyticsData.syncStats.attempted}</Text>
          <Text style={styles.statLabel}>Attempted</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{analyticsData.syncStats.successful}</Text>
          <Text style={styles.statLabel}>Successful</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{analyticsData.syncStats.failed}</Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{analyticsData.syncStats.pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics Dashboard</Text>
        {renderTimeRangeSelector()}
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading analytics data...</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {renderPhotoStats()}
          {renderDefectStats()}
          {renderScanStats()}
          {renderPdfStats()}
          {renderSyncStats()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.medium,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOWS.small,
  },
  title: {
    fontSize: FONTS.large,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.small,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.medium,
    paddingBottom: SPACING.xlarge,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.small,
  },
  timeRangeButton: {
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    marginHorizontal: SPACING.tiny,
    backgroundColor: COLORS.grey100,
  },
  selectedTimeRange: {
    backgroundColor: COLORS.primary,
  },
  timeRangeText: {
    fontSize: FONTS.small,
    color: COLORS.text,
  },
  selectedTimeRangeText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  sectionContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    marginBottom: SPACING.large,
    ...SHADOWS.small,
  },
  sectionTitle: {
    fontSize: FONTS.medium,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  chartTitle: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.medium,
    marginBottom: SPACING.small,
    textAlign: 'center',
  },
  chart: {
    marginVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    marginBottom: SPACING.medium,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 80,
    marginHorizontal: SPACING.tiny,
    marginBottom: SPACING.small,
  },
  statValue: {
    fontSize: FONTS.large,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default AnalyticsScreen;
