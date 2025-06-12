import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { TokenLogprob } from '../hooks/useRealtimeTranscription';

interface Props {
  text: string;
  logprobs?: TokenLogprob[];
}

const ColoredTranscript: React.FC<Props> = ({ text, logprobs }) => {

  // If no logprobs, render normal text
  if (!logprobs || logprobs.length === 0) {

    return <Text style={styles.defaultText}>{text}</Text>;
  }

  // Function to get color based on logprob value
  const getColorFromLogprob = (logprob: number): string => {
    // Logprobs are typically negative values
    // Higher (closer to 0) = more confident = green
    // Lower (more negative) = less confident = red
    
    let color: string;
    if (logprob >= -0.5) {
      // Very high confidence - green
      color = '#22c55e'; // green-500
    } else if (logprob >= -1.0) {
      // High confidence - light green
      color = '#84cc16'; // lime-500
    } else if (logprob >= -2.0) {
      // Medium confidence - yellow
      color = '#eab308'; // yellow-500
    } else if (logprob >= -3.0) {
      // Low confidence - orange
      color = '#f97316'; // orange-500
    } else {
      // Very low confidence - red
      color = '#ef4444'; // red-500
    }
    
    return color;
  };

  // Render tokens with colors
  const renderColoredTokens = () => {
    return logprobs!.map((tokenData, index) => {
      const color = getColorFromLogprob(tokenData.logprob);
      return (
        <Text
          key={index}
          style={[
            styles.token,
            { color: color }
          ]}
        >
          {tokenData.token}
        </Text>
      );
    });
  };

  return (
    <View style={styles.container}>
      {renderColoredTokens()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  defaultText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151', // gray-700
  },
  token: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
});

export default ColoredTranscript; 