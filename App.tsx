/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Button,
  TextInput,
  ScrollView,
  Platform,
  PermissionsAndroid,
  Alert,
  TouchableOpacity,
  FlatList,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LanguageSelector from './src/components/LanguageSelector';
import { LANGUAGES } from './src/constants/languages';
import useRealtimeTranscription, {
  Transcript,
} from './src/hooks/useRealtimeTranscription';

const MODELS = [
  { label: 'GPT-4o Mini', value: 'gpt-4o-mini-transcribe' },
  { label: 'GPT-4o', value: 'gpt-4o-transcribe' },
  { label: 'Whisper', value: 'whisper-1' },
];

const API_KEY_STORAGE_KEY = 'openai_api_key';
const SELECTED_MODEL_STORAGE_KEY = 'selected_model';
const LANGUAGE_A_STORAGE_KEY = 'language_a';
const LANGUAGE_B_STORAGE_KEY = 'language_b';

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini-transcribe');
  const [languageA, setLanguageA] = useState('de'); // German default
  const [languageB, setLanguageB] = useState('en'); // English default
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  const {
    finalTranscripts,
    interimTranscript,
    isRecording,
    startRecording,
    stopRecording,
    volume,
    translateTranscript,
    autoCommitCountdown,
    deleteTranscript,
    clearAllTranscripts,
    manualCommit,
  } = useRealtimeTranscription({
    apiKey,
    model: selectedModel,
    languageA,
    languageB,
  });

  // Load persisted values on app start
  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        const [storedApiKey, storedModel, storedLanguageA, storedLanguageB] = await Promise.all([
          AsyncStorage.getItem(API_KEY_STORAGE_KEY),
          AsyncStorage.getItem(SELECTED_MODEL_STORAGE_KEY),
          AsyncStorage.getItem(LANGUAGE_A_STORAGE_KEY),
          AsyncStorage.getItem(LANGUAGE_B_STORAGE_KEY),
        ]);

        if (storedApiKey) {
          setApiKey(storedApiKey);
        }
        if (storedModel) {
          setSelectedModel(storedModel);
        }
        if (storedLanguageA) {
          setLanguageA(storedLanguageA);
        }
        if (storedLanguageB) {
          setLanguageB(storedLanguageB);
        }
      } catch (error) {
        console.error('Failed to load persisted data:', error);
      }
    };

    loadPersistedData();
  }, []);

  // Save API key when it changes
  useEffect(() => {
    if (apiKey) {
      AsyncStorage.setItem(API_KEY_STORAGE_KEY, apiKey).catch((error) =>
        console.error('Failed to save API key:', error)
      );
    }
  }, [apiKey]);

  // Save selected model when it changes
  useEffect(() => {
    AsyncStorage.setItem(SELECTED_MODEL_STORAGE_KEY, selectedModel).catch((error) =>
      console.error('Failed to save selected model:', error)
    );
  }, [selectedModel]);

  // Save Language A when it changes
  useEffect(() => {
    AsyncStorage.setItem(LANGUAGE_A_STORAGE_KEY, languageA).catch((error) =>
      console.error('Failed to save Language A:', error)
    );
  }, [languageA]);

  // Save Language B when it changes
  useEffect(() => {
    AsyncStorage.setItem(LANGUAGE_B_STORAGE_KEY, languageB).catch((error) =>
      console.error('Failed to save Language B:', error)
    );
  }, [languageB]);

  const requestMicPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'This app requires access to your microphone to perform speech recognition.',
        buttonPositive: 'Ok',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const handleStartRecording = async () => {
    if (!apiKey) {
      Alert.alert('API Key Required', 'Please enter your OpenAI API key.');
      return;
    }
    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Cannot access microphone.');
      return;
    }
    startRecording();
  };

  const handleTranslate = async (transcriptId: string, targetLanguageCode: string) => {
    if (translatingIds.has(transcriptId)) return;

    const targetLanguage = LANGUAGES.find(lang => lang.value === targetLanguageCode);
    if (!targetLanguage) {
      Alert.alert('Error', 'Target language not found');
      return;
    }

    setTranslatingIds(prev => new Set(prev).add(transcriptId));

    try {
      await translateTranscript(transcriptId, targetLanguage.label);
    } catch (error) {
      Alert.alert('Translation Error', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setTranslatingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(transcriptId);
        return newSet;
      });
    }
  };

  const handleDeleteTranscript = (transcriptId: string) => {
    Alert.alert(
      'Delete Transcript',
      'Are you sure you want to delete this transcript?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTranscript(transcriptId);
          },
        },
      ]
    );
  };

  const handleClearAllTranscripts = () => {
    if (finalTranscripts.length === 0) {
      Alert.alert('No Transcripts', 'There are no transcripts to clear.');
      return;
    }

    Alert.alert(
      'Clear All Transcripts',
      `Are you sure you want to delete all ${finalTranscripts.length} transcripts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearAllTranscripts();
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    if (finalTranscripts.length === 0) {
      Alert.alert('No Transcripts', 'There are no transcripts to share.');
      return;
    }

    // Format transcripts for sharing
    const formattedTranscripts = finalTranscripts
      .map((transcript, index) => {
        const time = transcript.timestamp.toLocaleString();
        let text = `${index + 1}. [${time}] ${transcript.text}`;
        if (transcript.originalText && transcript.originalText !== transcript.text) {
          text += `\n   Original: ${transcript.originalText}`;
        }
        return text;
      })
      .reverse() // Show oldest first in share
      .join('\n\n');

    const shareText = `📝 Transcription Results (${finalTranscripts.length} segments)\n\n${formattedTranscripts}`;

    try {
      await Share.share({
        message: shareText,
        title: 'Transcription Results',
      });
    } catch (shareError) {
      Alert.alert('Share Error', 'Unable to share transcripts.');
    }
  };

  const renderTranscript = ({ item }: { item: any }) => {
    const isTranslating = translatingIds.has(item.id);
    const isTranslated = item.text.includes('(') && item.text.includes(')');
    
    return (
      <View style={styles.transcriptItem}>
        <View style={styles.transcriptHeader}>
          <View style={styles.transcriptMeta}>
            <Text style={styles.transcriptTime}>
              {item.timestamp.toLocaleTimeString()}
            </Text>
            {item.detectedLanguageName && (
              <Text style={styles.detectedLanguage}>
                {item.detectedLanguageName}
              </Text>
            )}
          </View>
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={() => handleDeleteTranscript(item.id)}
          >
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.transcriptContent}>
          <View style={styles.transcriptTextContainer}>
            <Text style={[
              styles.transcriptText,
              isTranslated && styles.translatedText,
            ]}>
              {isTranslating ? 'Translating...' : item.text}
            </Text>
            {item.originalText && (
              <Text style={styles.originalText}>
                Original: {item.originalText}
              </Text>
            )}
          </View>
          
          <View style={styles.translateButtons}>
            <TouchableOpacity
              style={[styles.translateButton, styles.translateButtonA]}
              onPress={() => handleTranslate(item.id, languageA)}
              disabled={isTranslating}
            >
              <Text style={styles.translateButtonText}>
                {LANGUAGES.find(l => l.value === languageA)?.label.slice(0, 2).toUpperCase() || 'A'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.translateButton, styles.translateButtonB]}
              onPress={() => handleTranslate(item.id, languageB)}
              disabled={isTranslating}
            >
              <Text style={styles.translateButtonText}>
                {LANGUAGES.find(l => l.value === languageB)?.label.slice(0, 2).toUpperCase() || 'B'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const volumeWidth = Math.min(volume * 200, 200);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>BabelScribe</Text>

        <Text style={styles.label}>OpenAI API Key</Text>
        <TextInput
          style={styles.input}
          placeholder="sk-..."
          secureTextEntry
          value={apiKey}
          onChangeText={setApiKey}
        />

        <Text style={styles.label}>Model</Text>
        <LanguageSelector
          languages={MODELS}
          selected={selectedModel}
          onChange={setSelectedModel}
        />

        <Text style={styles.label}>Language A (Blue Button)</Text>
        <LanguageSelector
          languages={LANGUAGES}
          selected={languageA}
          onChange={setLanguageA}
        />

        <Text style={styles.label}>Language B (Orange Button)</Text>
        <LanguageSelector
          languages={LANGUAGES}
          selected={languageB}
          onChange={setLanguageB}
        />

        <View style={styles.meterContainer}>
          <View
            style={[styles.meterFill, { width: volumeWidth }]}
          />
        </View>

        {/* Recording controls and status */}
        <View style={styles.recordingSection}>
          {isRecording && (
            <TouchableOpacity 
              style={styles.countdownContainer}
              onPress={manualCommit}
              activeOpacity={0.7}
            >
              <Text style={styles.countdownLabel}>Auto-commit in:</Text>
              <Text style={styles.countdownNumber}>
                {autoCommitCountdown > 0 ? `${autoCommitCountdown}s` : 'Committing...'}
              </Text>
              <Text style={styles.countdownHint}>Tap to commit now</Text>
            </TouchableOpacity>
          )}
          
          <Button
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
            onPress={isRecording ? stopRecording : handleStartRecording}
            color={isRecording ? 'red' : undefined}
          />
        </View>

        <Text style={styles.label}>Transcript</Text>
        
        {/* Transcript action buttons */}
        {finalTranscripts.length > 0 && (
          <View style={styles.transcriptActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleShare}
            >
              <Text style={styles.actionButtonText}>📤 Share</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.dangerButton]}
              onPress={handleClearAllTranscripts}
            >
              <Text style={[styles.actionButtonText, styles.dangerButtonText]}>🗑️ Clear All</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.transcriptBox}>
          {!!interimTranscript && (
            <Text style={styles.interimText}>{interimTranscript}</Text>
          )}
          <FlatList
            data={finalTranscripts}
            renderItem={renderTranscript}
            keyExtractor={(item) => item.id}
            style={styles.transcriptsList}
            scrollEnabled={false}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  label: {
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
  },
  transcriptBox: {
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    minHeight: 120,
  },
  meterContainer: {
    height: 8,
    width: '100%',
    backgroundColor: '#eee',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 12,
  },
  meterFill: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
  interimText: {
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  transcriptItem: {
    marginVertical: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  transcriptItemTranslating: {
    backgroundColor: '#f0f0f0',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transcriptMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transcriptTime: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  detectedLanguage: {
    fontSize: 10,
    color: '#4caf50',
    marginLeft: 8,
    fontWeight: 'bold',
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  transcriptText: {
    fontSize: 16,
  },
  translatedText: {
    color: '#4caf50',
  },
  originalText: {
    color: '#999',
    fontStyle: 'italic',
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#999',
  },
  transcriptContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transcriptTextContainer: {
    flexDirection: 'column',
    flex: 1,
  },
  countdownText: {
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  transcriptsList: {
    marginTop: 8,
  },
  recordingSection: {
    marginVertical: 16,
  },
  countdownContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#fff3cd',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ffeeba',
  },
  countdownLabel: {
    fontSize: 16,
    color: '#856404',
    marginRight: 8,
  },
  countdownNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#856404',
  },
  countdownHint: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  transcriptActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  actionButton: {
    padding: 12,
    backgroundColor: '#4caf50',
    borderRadius: 4,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  dangerButton: {
    backgroundColor: '#f44336',
  },
  dangerButtonText: {
    color: '#fff',
  },
  translateButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  translateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 40,
    alignItems: 'center',
  },
  translateButtonA: {
    backgroundColor: '#2196f3',
  },
  translateButtonB: {
    backgroundColor: '#ff9800',
  },
  translateButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
