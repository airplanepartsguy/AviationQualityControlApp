import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native'; 
import { DebugScreenProps } from '../types/navigation';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../styles/theme'; 
import CustomButton from '../components/CustomButton'; 

const logFilePath = `${FileSystem.documentDirectory}errorLog.txt`; 

const DebugScreen: React.FC<DebugScreenProps> = ({ navigation }) => {
  const [logs, setLogs] = useState<string>('Loading logs...');

  const readLogs = async () => {
    setLogs('Reading logs...'); 
    try {
      const fileInfo = await FileSystem.getInfoAsync(logFilePath);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(logFilePath);
        setLogs(content || 'Log file is empty.');
      } else {
        setLogs('No log file found.');
      }
    } catch (error: any) {
      console.error('Failed to read logs:', error);
      setLogs(`Failed to read logs: ${error.message}`);
    }
  };

  const clearLogs = async () => {
    setLogs('Clearing logs...'); 
    try {
      await FileSystem.writeAsStringAsync(logFilePath, ''); 
      setLogs('Logs cleared.');
    } catch (error: any) {
      console.error('Failed to clear logs:', error);
      setLogs(`Failed to clear logs: ${error.message}`);
    }
  };

  useEffect(() => {
    readLogs();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Debug Logs</Text>
        <ScrollView style={styles.logContainer}>
          <Text style={styles.logText}>{logs}</Text>
        </ScrollView>
        <View style={styles.buttonContainer}>
          <CustomButton title="Refresh Logs" onPress={readLogs} style={styles.button} variant="secondary" />
          <CustomButton title="Clear Logs" onPress={clearLogs} variant="danger" style={styles.button} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS?.background || '#F5F5F5',
  },
  container: {
    flex: 1,
    padding: SPACING?.medium || 15,
  },
  title: {
    fontSize: FONTS?.large || 22, 
    fontWeight: 'bold',
    color: COLORS?.primary || '#007AFF', 
    marginBottom: SPACING?.medium || 15,
    textAlign: 'center',
  },
  logContainer: {
    flex: 1,
    backgroundColor: COLORS?.grey100 || '#EEEEEE',
    borderWidth: 1,
    borderColor: COLORS?.grey300 || '#CCCCCC',
    borderRadius: BORDER_RADIUS?.small || 5,
    padding: SPACING?.medium || 10,
    marginBottom: SPACING?.medium || 15,
  },
  logText: {
    fontSize: FONTS?.small || 12,
    color: COLORS?.black || '#333333', 
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', 
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING?.small || 10, 
  },
  button: {
    flex: 1, 
    marginHorizontal: SPACING?.small || 5,
  },
});

export default DebugScreen;
