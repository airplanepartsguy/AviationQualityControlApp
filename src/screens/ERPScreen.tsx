import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { COLORS, SPACING } from '../styles/theme'; // Corrected theme path

const ERPScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ERP Integration</Text>
      <Text style={styles.subtitle}>Manage ERP connections and settings.</Text>
      {/* Placeholder for SharePoint connection settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SharePoint</Text>
        <Button title="Connect to SharePoint" onPress={() => console.log('Connect to SharePoint pressed')} />
        {/* Add more SharePoint specific settings here */}
      </View>
      {/* Placeholder for Salesforce connection settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Salesforce</Text>
        <Button title="Connect to Salesforce" onPress={() => console.log('Connect to Salesforce pressed')} disabled />
        {/* Add more Salesforce specific settings here */}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.medium,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textLight,
    marginBottom: SPACING.large,
  },
  section: {
    marginBottom: SPACING.medium,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
});

export default ERPScreen;
