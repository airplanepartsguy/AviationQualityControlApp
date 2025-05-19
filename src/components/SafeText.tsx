import React from 'react';
import { Text, TextProps } from 'react-native';

/**
 * SafeText component to ensure text is always properly wrapped in a Text component
 * This helps prevent "Text strings must be rendered within a <Text> component" errors
 */
const SafeText: React.FC<TextProps & { children: React.ReactNode }> = ({ children, ...props }) => {
  // If children is a string or number, wrap it in a Text component
  // Otherwise, return the children as is (assuming they're already properly wrapped)
  return (
    <Text {...props}>
      {children}
    </Text>
  );
};

export default SafeText;
