import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../styles/theme'; // Corrected theme path

const HistoryScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>History Screen</Text>
      <Text style={styles.subtitle}>View past activities and batches here.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background, // Example usage of theme color
    padding: SPACING.medium, // Example usage of theme spacing
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text, // Example usage of theme color
    marginBottom: SPACING.small,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textLight, // Used for subtitles
  },
});

export default HistoryScreen;
