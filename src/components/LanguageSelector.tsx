import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

export type LanguageCode = string;

interface Props {
  languages: { label: string; value: LanguageCode }[];
  selected: LanguageCode;
  onChange: (val: LanguageCode) => void;
}

const LanguageSelector: React.FC<Props> = ({ languages, selected, onChange }) => {
  return (
    <View style={styles.container}>
      <Picker
        selectedValue={selected}
        onValueChange={onChange}
        mode="dropdown"
        style={styles.picker}
      >
        {languages.map(({ label, value }) => (
          <Picker.Item key={value} label={label} value={value} />
        ))}
      </Picker>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  picker: {
    height: 50,
    width: '100%',
  },
});

export default LanguageSelector; 