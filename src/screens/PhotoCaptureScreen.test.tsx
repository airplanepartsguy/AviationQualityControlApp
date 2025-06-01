import React from 'react';
import { View, Text, SafeAreaView, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// This is a test file to verify JSX structure
const PhotoCaptureScreenTest = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={{ flex: 1 }}>
          {/* Content area */}
          <View>
            <Text>Test content</Text>
          </View>
          
          {/* Bottom area */}
          <View>
            <Text>Bottom controls</Text>
          </View>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

export default PhotoCaptureScreenTest;
