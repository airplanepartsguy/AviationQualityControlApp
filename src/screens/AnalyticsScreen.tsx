// src/screens/AnalyticsScreen.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnalyticsTabScreenProps } from '../types/navigation'; // Use correct Tab props
import { SafeAreaView } from 'react-native-safe-area-context';
// Assuming theme structure exists, otherwise use default values
import { COLORS, FONTS, SPACING } from '../styles/theme';

const AnalyticsScreen: React.FC<AnalyticsTabScreenProps> = ({ navigation }) => {
  // TODO: Implement actual analytics display (charts, tables)
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Analytics</Text>
        <Text style={styles.placeholderText}>
          Analytics data and charts will be displayed here.
          (Requires react-native-chart-kit and database integration)
        </Text>
        {/* Add filters, charts, etc. later */}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background || '#F5F5F5', // Use theme background or fallback
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING?.medium || 16,
  },
  title: {
    fontSize: FONTS?.large || 20,
    fontWeight: 'bold',
    color: COLORS.text || '#333', // Use defined theme text color
    marginBottom: SPACING?.large || 24,
  },
  placeholderText: {
    fontSize: FONTS?.regular || 16,
    color: COLORS.textLight || '#666', // Use defined theme light text color
    textAlign: 'center',
  },
});

export default AnalyticsScreen;
