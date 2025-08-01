import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../styles/theme';

interface WorkflowStep {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  description?: string;
}

interface WorkflowProgressProps {
  currentStep: number;
  steps?: WorkflowStep[];
  compact?: boolean;
}

const DEFAULT_STEPS: WorkflowStep[] = [
  {
    id: 'scan',
    title: 'Scan',
    icon: 'barcode-outline',
    description: 'Scan barcode or enter ID',
  },
  {
    id: 'capture',
    title: 'Capture',
    icon: 'camera-outline',
    description: 'Take quality photos',
  },
  {
    id: 'review',
    title: 'Review',
    icon: 'eye-outline',
    description: 'Review batch',
  },
  {
    id: 'upload',
    title: 'Upload',
    icon: 'cloud-upload-outline',
    description: 'Sync to systems',
  },
];

const WorkflowProgress: React.FC<WorkflowProgressProps> = ({
  currentStep,
  steps = DEFAULT_STEPS,
  compact = false,
}) => {
  const renderStep = (step: WorkflowStep, index: number) => {
    const isActive = index === currentStep;
    const isCompleted = index < currentStep;
    const isUpcoming = index > currentStep;

    const stepStatus = isCompleted ? 'completed' : isActive ? 'active' : 'upcoming';

    return (
      <View key={step.id} style={styles.stepContainer}>
        {/* Step Circle */}
        <View style={[
          styles.stepCircle,
          stepStatus === 'completed' && styles.stepCircleCompleted,
          stepStatus === 'active' && styles.stepCircleActive,
          stepStatus === 'upcoming' && styles.stepCircleUpcoming,
        ]}>
          {isCompleted ? (
            <Ionicons name="checkmark" size={16} color={COLORS.white} />
          ) : (
            <Ionicons 
              name={step.icon} 
              size={16} 
              color={isActive ? COLORS.white : COLORS.grey500} 
            />
          )}
        </View>

        {/* Step Content */}
        {!compact && (
          <View style={styles.stepContent}>
            <Text style={[
              styles.stepTitle,
              stepStatus === 'completed' && styles.stepTitleCompleted,
              stepStatus === 'active' && styles.stepTitleActive,
              stepStatus === 'upcoming' && styles.stepTitleUpcoming,
            ]}>
              {step.title}
            </Text>
            {step.description && (
              <Text style={[
                styles.stepDescription,
                stepStatus === 'active' && styles.stepDescriptionActive,
              ]}>
                {step.description}
              </Text>
            )}
          </View>
        )}

        {/* Connection Line */}
        {index < steps.length - 1 && (
          <View style={[
            styles.connectionLine,
            (isCompleted || (isActive && index < steps.length - 1)) && styles.connectionLineCompleted,
          ]} />
        )}
      </View>
    );
  };

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactSteps}>
          {steps.map(renderStep)}
        </View>
        <Text style={styles.compactLabel}>
          Step {currentStep + 1} of {steps.length}: {steps[currentStep]?.title}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.progressTitle}>Quality Control Process</Text>
      <View style={styles.stepsContainer}>
        {steps.map(renderStep)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  progressTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stepContainer: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: SPACING.sm,
  },
  stepCircleCompleted: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  stepCircleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  stepCircleUpcoming: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.grey300,
  },
  stepContent: {
    alignItems: 'center',
    minHeight: 50,
  },
  stepTitle: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.bold,
    textAlign: 'center',
    marginBottom: 2,
  },
  stepTitleCompleted: {
    color: COLORS.success,
  },
  stepTitleActive: {
    color: COLORS.primary,
  },
  stepTitleUpcoming: {
    color: COLORS.grey500,
  },
  stepDescription: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: FONTS.lineHeightSmall,
  },
  stepDescriptionActive: {
    color: COLORS.text,
    fontWeight: FONTS.mediumWeight,
  },
  connectionLine: {
    position: 'absolute',
    top: 20,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: COLORS.grey300,
    zIndex: -1,
  },
  connectionLineCompleted: {
    backgroundColor: COLORS.primary,
  },
  
  // Compact styles
  compactContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  compactSteps: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  compactLabel: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: FONTS.mediumWeight,
  },
});

export default WorkflowProgress; 