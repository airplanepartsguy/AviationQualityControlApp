import React, { forwardRef, Ref } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { COLORS } from '../styles/theme';

interface CustomInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  errorStyle?: StyleProp<TextStyle>;
}

// Use forwardRef to allow passing a ref to the internal TextInput
const CustomInput = forwardRef<TextInput, CustomInputProps>(
  (
    {
      label,
      error,
      containerStyle,
      inputStyle,
      labelStyle,
      errorStyle,
      ...rest
    },
    ref // Receive the ref here
  ) => {
    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={[styles.label, labelStyle]}>{label}</Text>}
        <TextInput
          ref={ref} // Pass the ref to the actual TextInput
          style={[
            styles.input,
            inputStyle,
            error ? styles.inputError : null, // Apply error style if error exists
          ]}
          placeholderTextColor={COLORS.grey500}
          {...rest}
        />
        {error && <Text style={[styles.errorText, errorStyle]}>{error}</Text>}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    marginBottom: 15, // Add some margin below each input group
    width: '100%', // Default to full width
  },
  label: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 5,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#000000', // Ensure text color is visible
  },
  inputError: {
    borderColor: '#FF3B30', // iOS error red
  },
  errorText: {
    color: '#FF3B30', // iOS error red
    fontSize: 12,
    marginTop: 4,
  },
});

export default CustomInput;
