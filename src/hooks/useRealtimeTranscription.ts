import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import AudioRecord from 'react-native-audio-record';
import { Buffer } from 'buffer';
import { franc } from 'franc';

export interface Transcript {
  id: string;
  timestamp: Date;
  text: string;
  originalText?: string; // Store original text for multiple translations
  detectedLanguage?: string; // ISO language code detected by franc
  detectedLanguageName?: string; // Human readable language name
}

interface Options {
  language?: string; // ISO code matching OpenAI language param - optional for auto-detection
  apiKey: string;
  model: string;
  languageA?: string; // Language A for auto-translation
  languageB?: string; // Language B for auto-translation
}

export default function useRealtimeTranscription({ language, apiKey, model, languageA, languageB }: Options) {
  const [finalTranscripts, setFinalTranscripts] = useState<Transcript[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isRecording, setRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const [hasSentAudio, setHasSentAudio] = useState(false);
  const [autoCommitCountdown, setAutoCommitCountdown] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResetTimeRef = useRef<number>(0);
  const audioChunksSinceLastCommit = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  // Helper to log with consistent prefix
  const log = (...args: any[]) => console.log('[Realtime]', ...args);

  // Helper to convert ISO language codes to readable names
  const getLanguageName = useCallback((isoCode: string): string => {
    const languageNames: { [key: string]: string } = {
      'eng': 'English',
      'spa': 'Spanish',
      'fra': 'French',
      'deu': 'German',
      'ita': 'Italian',
      'por': 'Portuguese',
      'rus': 'Russian',
      'jpn': 'Japanese',
      'kor': 'Korean',
      'cmn': 'Chinese',
      'ara': 'Arabic',
      'hin': 'Hindi',
      'nld': 'Dutch',
      'swe': 'Swedish',
      'nor': 'Norwegian',
      'dan': 'Danish',
      'fin': 'Finnish',
      'pol': 'Polish',
      'ces': 'Czech',
      'hun': 'Hungarian',
      'ron': 'Romanian',
      'bul': 'Bulgarian',
      'hrv': 'Croatian',
      'slk': 'Slovak',
      'slv': 'Slovenian',
      'est': 'Estonian',
      'lav': 'Latvian',
      'lit': 'Lithuanian',
      'ell': 'Greek',
      'tur': 'Turkish',
      'heb': 'Hebrew',
      'tha': 'Thai',
      'vie': 'Vietnamese',
      'ind': 'Indonesian',
      'msa': 'Malay',
      'tgl': 'Filipino',
      'ukr': 'Ukrainian',
      'cat': 'Catalan',
      'eus': 'Basque',
      'glg': 'Galician',
      'und': 'Unknown'
    };
    return languageNames[isoCode] || isoCode.toUpperCase();
  }, []);

  // Helper to map franc language codes to our language selector codes
  const mapToLanguageCode = useCallback((francCode: string): string | null => {
    const mapping: { [key: string]: string } = {
      'eng': 'en',
      'spa': 'es', 
      'fra': 'fr',
      'deu': 'de',
      'ita': 'it',
      'por': 'pt',
      'rus': 'ru',
      'jpn': 'ja',
      'kor': 'ko',
      'cmn': 'zh',
      'ara': 'ar',
      'hin': 'hi',
      'nld': 'nl',
      'swe': 'sv',
      'nor': 'no',
      'dan': 'da',
      'fin': 'fi',
      'pol': 'pl',
      'ces': 'cs',
      'hun': 'hu',
      'ron': 'ro',
      'bul': 'bg',
      'hrv': 'hr',
      'slk': 'sk',
      'slv': 'sl',
      'est': 'et',
      'lav': 'lv',
      'lit': 'lt',
      'ell': 'el',
      'tur': 'tr',
      'heb': 'he',
      'tha': 'th',
      'vie': 'vi',
      'ind': 'id',
      'msa': 'ms',
      'tgl': 'tl',
      'ukr': 'uk',
      'cat': 'ca',
      'eus': 'eu',
      'glg': 'gl'
    };
    return mapping[francCode] || null;
  }, []);

  // Helper to get language name from language code
  const getLanguageNameFromCode = useCallback((langCode: string): string => {
    const codeToName: { [key: string]: string } = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'sv': 'Swedish',
      'no': 'Norwegian',
      'da': 'Danish',
      'fi': 'Finnish',
      'pl': 'Polish',
      'cs': 'Czech',
      'hu': 'Hungarian',
      'ro': 'Romanian',
      'bg': 'Bulgarian',
      'hr': 'Croatian',
      'sk': 'Slovak',
      'sl': 'Slovenian',
      'et': 'Estonian',
      'lv': 'Latvian',
      'lt': 'Lithuanian',
      'el': 'Greek',
      'tr': 'Turkish',
      'he': 'Hebrew',
      'th': 'Thai',
      'vi': 'Vietnamese',
      'id': 'Indonesian',
      'ms': 'Malay',
      'tl': 'Filipino',
      'uk': 'Ukrainian',
      'ca': 'Catalan',
      'eu': 'Basque',
      'gl': 'Galician'
    };
    return codeToName[langCode] || langCode.toUpperCase();
  }, []);

  // Helper to perform automatic translation
  const performAutoTranslation = useCallback(async (transcriptId: string, transcriptText: string, targetLangCode: string, targetLangName: string) => {
    if (!apiKey) {
      log('Auto-translation failed: No API key');
      return;
    }
    
    try {
      log(`Auto-translating to ${targetLangName}...`);
      log('Text to translate:', transcriptText);
      
      const systemPrompt = `You are a helpful assistant. Translate the following text accurately to ${targetLangName}. Output only the translated text.`;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcriptText },
      ];

      log('Making auto-translation API call...');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: messages,
          temperature: 0.3,
        }),
      });

      log('Auto-translation API response status:', response.status);
      
      if (!response.ok) {
        const errText = await response.text();
        log(`Auto-translation API error: ${response.status}`, errText);
        return;
      }

      const data = await response.json();
      const translatedText = data.choices?.[0]?.message?.content?.trim() || '';
      log('Auto-translation API response:', translatedText);

      if (translatedText) {
        log('Updating transcript with auto-translation...');
        setFinalTranscripts((prev) =>
          prev.map((item) =>
            item.id === transcriptId
              ? { 
                  ...item, 
                  text: `${translatedText} (${targetLangName})`,
                  originalText: item.originalText || item.text
                }
              : item
          )
        );
        log(`Auto-translation completed: ${transcriptText} -> ${translatedText}`);
      } else {
        log('Auto-translation failed: Empty response');
      }
    } catch (error) {
      log('Auto-translation failed with error:', error);
    }
  }, [apiKey]);

  // Update ref when isRecording changes
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoCommitCountdown(0);
  }, []);

  const startAutoCommitTimer = useCallback(() => {
    if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
    
    // Only restart countdown if not already running
    if (!countdownIntervalRef.current) {
      setAutoCommitCountdown(10);
      countdownIntervalRef.current = setInterval(() => {
        setAutoCommitCountdown((prev) => {
          log('Countdown tick (start):', prev, '->', prev - 1);
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    commitTimeoutRef.current = setTimeout(() => {
      log('Auto-committing due to 10s of no audio...');
      // Inline commit logic to avoid circular dependency
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const MIN_CHUNKS_FOR_100MS = 1;
        if (audioChunksSinceLastCommit.current >= MIN_CHUNKS_FOR_100MS) {
          log(`Committing audio buffer with ${audioChunksSinceLastCommit.current} chunks...`);
          wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          audioChunksSinceLastCommit.current = 0;
          setHasSentAudio(false);
        } else {
          log(`Skipping auto-commit: only ${audioChunksSinceLastCommit.current} chunks (need at least ${MIN_CHUNKS_FOR_100MS} for 100ms)`);
        }
      } else {
        log('WebSocket not open, cannot commit.');
      }
      
      // Clear timers
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = null;
      }
      clearCountdown();
      
      // Restart timer if still recording
      if (isRecordingRef.current) {
        log('Still recording after auto-commit, restarting timer');
        setTimeout(() => {
          if (isRecordingRef.current) {
            startAutoCommitTimer();
          }
        }, 100);
      }
    }, 10000);
  }, [clearCountdown]);

  const commit = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Ensure we have at least 1 chunk (100ms of audio) before committing
      const MIN_CHUNKS_FOR_100MS = 1;
      if (audioChunksSinceLastCommit.current >= MIN_CHUNKS_FOR_100MS) {
        log(`Committing audio buffer with ${audioChunksSinceLastCommit.current} chunks...`);
        wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        audioChunksSinceLastCommit.current = 0; // Reset chunk counter after commit
        setHasSentAudio(false); // Reset flag after commit
      } else {
        log(`Skipping commit: only ${audioChunksSinceLastCommit.current} chunks (need at least ${MIN_CHUNKS_FOR_100MS} for 100ms)`);
      }
    } else {
      log('WebSocket not open, cannot commit.');
    }
    // Clear any pending timer and countdown
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
    }
    clearCountdown();
  }, [clearCountdown]);

  const resetAutoCommitTimer = useCallback(() => {
    // Clear existing timers
    if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
    clearCountdown();
    
    // Restart both countdown and timeout
    setAutoCommitCountdown(10);
    countdownIntervalRef.current = setInterval(() => {
      setAutoCommitCountdown((prev) => {
        log('Countdown tick:', prev, '->', prev - 1);
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    commitTimeoutRef.current = setTimeout(() => {
      log('Auto-committing due to 10s of no audio...');
      // Inline commit logic to avoid circular dependency
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const MIN_CHUNKS_FOR_100MS = 1;
        if (audioChunksSinceLastCommit.current >= MIN_CHUNKS_FOR_100MS) {
          log(`Committing audio buffer with ${audioChunksSinceLastCommit.current} chunks...`);
          wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          audioChunksSinceLastCommit.current = 0;
          setHasSentAudio(false);
        } else {
          log(`Skipping auto-commit: only ${audioChunksSinceLastCommit.current} chunks (need at least ${MIN_CHUNKS_FOR_100MS} for 100ms)`);
        }
      } else {
        log('WebSocket not open, cannot commit.');
      }
      
      // Clear timers
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = null;
      }
      clearCountdown();
      
      // Restart timer if still recording
      if (isRecordingRef.current) {
        log('Still recording after auto-commit, restarting timer');
        setTimeout(() => {
          if (isRecordingRef.current) {
            startAutoCommitTimer();
          }
        }, 100);
      }
    }, 10000);
  }, [clearCountdown, startAutoCommitTimer]);

  const translateTranscript = useCallback(
    async (transcriptId: string, targetLangName: string) => {
      if (!apiKey) {
        log('Translation failed: API key is not set.');
        throw new Error('API key is not set.');
      }

      const transcript = finalTranscripts.find((t) => t.id === transcriptId);
      if (!transcript) {
        throw new Error('Transcript not found.');
      }

      // Use original text if available, otherwise use current text
      const textToTranslate = transcript.originalText || transcript.text;
      const systemPrompt = `You are a helpful assistant. Translate the following text accurately to ${targetLangName}. Output only the translated text.`;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: textToTranslate },
      ];

      log('Translating with fetch...');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: messages,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        log(`Translation API error: ${response.status}`, errText);
        throw new Error(`OpenAI API error: ${response.status} ${errText}`);
      }

      const data = await response.json();
      const translatedText = data.choices?.[0]?.message?.content?.trim() || '';

      if (translatedText) {
        setFinalTranscripts((prev) =>
          prev.map((item) =>
            item.id === transcriptId
              ? { 
                  ...item, 
                  text: `${translatedText} (${targetLangName})`,
                  originalText: item.originalText || item.text // Store original if not already stored
                }
              : item
          )
        );
      }
      return translatedText;
    },
    [apiKey, finalTranscripts]
  );

  const deleteTranscript = useCallback((transcriptId: string) => {
    setFinalTranscripts((prev) => prev.filter(t => t.id !== transcriptId));
  }, []);

  const clearAllTranscripts = useCallback(() => {
    setFinalTranscripts([]);
  }, []);

  const manualCommit = useCallback(() => {
    if (isRecordingRef.current) {
      log('Manual commit triggered');
      commit();
      // Restart the timer after manual commit
      setTimeout(() => {
        if (isRecordingRef.current) {
          startAutoCommitTimer();
        }
      }, 100);
    }
  }, [commit, startAutoCommitTimer]);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    log('Stopping audio capture. Committing...');
    AudioRecord.stop();
    setRecording(false);
    commit(); // This also clears the auto-commit timer
  }, [isRecording, commit]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;

    // If we have a live connection, just start recording audio again.
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      log('Resuming audio capture on existing WebSocket connection.');
      setHasSentAudio(false); // Reset for the new utterance
      setRecording(true);
      AudioRecord.start();
      startAutoCommitTimer();
      return;
    }

    // New session, clear old transcripts.
    log('Starting new recording session...');
    setFinalTranscripts([]);
    setInterimTranscript('');
    setHasSentAudio(false); // Reset for the new session

    const sampleRate = 16000;

    // Configure audio
    AudioRecord.init({
      sampleRate,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6,
      wavFile: '',
    });

    // Build WS connection (Realtime Transcription API)
    log('Connecting to realtime WS...');
    const ws = new WebSocket(
      'wss://api.openai.com/v1/realtime?intent=transcription',
      ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
    );
    wsRef.current = ws;

    ws.onopen = () => {
      log('WebSocket open');
      // Update session with desired model & language
      ws.send(
        JSON.stringify({
          type: 'transcription_session.update',
          session: {
            input_audio_transcription: {
              model
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 800,
            },
          },
        })
      );

      setRecording(true);
      AudioRecord.start();
      startAutoCommitTimer(); // Start the timer when recording begins
    };

    ws.onmessage = (e) => {
      log('WS message received', e.data);
      try {
        const data = JSON.parse(e.data);
        // log('Parsed WS message', data);
        switch (data.type) {
          case 'conversation.item.input_audio_transcription.delta':
            if (data.delta) {
              setInterimTranscript((prev) => prev + data.delta);
              // Only reset timer if we're still recording
              if (isRecordingRef.current) {
                log('Transcription delta received, resetting timer');
                resetAutoCommitTimer();
              }
            }
            break;
          case 'conversation.item.input_audio_transcription.completed':
            if (data.transcript && data.transcript.trim()) {
              // Detect language of the transcript
              const detectedLangCode = franc(data.transcript);
              const detectedLangName = getLanguageName(detectedLangCode);
              
              log('Language detected:', detectedLangCode, '->', detectedLangName);
              log('Current languageA:', languageA, 'languageB:', languageB);
              
              const transcriptId = `${Date.now()}-${Math.random()}`;
              const newTranscript: Transcript = {
                id: transcriptId,
                timestamp: new Date(),
                text: data.transcript.trim(),
                detectedLanguage: detectedLangCode,
                detectedLanguageName: detectedLangName,
                // Don't set originalText here since this is the original
              };
              setFinalTranscripts((prev) => [newTranscript, ...prev]);
              setInterimTranscript('');
              
              // Check for auto-translation
              const mappedLangCode = mapToLanguageCode(detectedLangCode);
              log('Mapped language code:', mappedLangCode);
              
              if (mappedLangCode && languageA && languageB) {
                log('Auto-translation check: mappedLangCode =', mappedLangCode, 'languageA =', languageA, 'languageB =', languageB);
                if (mappedLangCode === languageB) {
                  // Detected language matches Language B, auto-translate to Language A
                  const targetLangName = getLanguageNameFromCode(languageA);
                  log(`Auto-translating from ${detectedLangName} to ${targetLangName}`);
                  setTimeout(() => performAutoTranslation(transcriptId, data.transcript.trim(), languageA, targetLangName), 500);
                } else if (mappedLangCode === languageA) {
                  // Detected language matches Language A, auto-translate to Language B
                  const targetLangName = getLanguageNameFromCode(languageB);
                  log(`Auto-translating from ${detectedLangName} to ${targetLangName}`);
                  setTimeout(() => performAutoTranslation(transcriptId, data.transcript.trim(), languageB, targetLangName), 500);
                } else {
                  log('No auto-translation: detected language does not match either target language');
                }
              } else {
                log('No auto-translation: missing parameters - mappedLangCode:', mappedLangCode, 'languageA:', languageA, 'languageB:', languageB);
              }
              
              // Only reset timer if we're still recording
              if (isRecordingRef.current) {
                log('Transcription completed, resetting timer');
                resetAutoCommitTimer();
              }
            } else {
              log('Skipping empty transcript');
            }
            break;
          default:
            break;
        }
      } catch (err) {
        console.warn('Failed to parse ws message', err);
      }
    };

    ws.onerror = (e: any) => {
      console.error('WS error', e.message ?? e);
    };

    ws.onclose = (ev) => {
      log('WS closed', ev.code, ev.reason);
      setRecording(false);
      wsRef.current = null; // Nullify the ref
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
        commitTimeoutRef.current = null;
      }
      clearCountdown();
    };

    // Stream audio data
    let chunkCounter = 0;
    AudioRecord.on('data', (chunk: string) => {
      // chunk is base64-encoded 16-bit PCM mono @ sampleRate Hz
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      // Calculate RMS level for UI meter
      const bytes = Buffer.from(chunk, 'base64');
      const sampleCount = Math.min(bytes.length / 2, 2048); // analyse first ~2k samples
      let sumSq = 0;
      for (let i = 0; i < sampleCount; i++) {
        const sample = bytes.readInt16LE(i * 2);
        sumSq += sample * sample;
      }
      const rms = Math.sqrt(sumSq / sampleCount);
      setVolume(rms / 32768);

      wsRef.current.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: chunk,
        })
      );
      setHasSentAudio(true); // Mark that we've sent audio
      audioChunksSinceLastCommit.current += 1; // Track chunks sent since last commit

      // Don't reset timer based on audio levels anymore
      // Timer will be reset when API responds with transcription data

      if (chunkCounter % 10 === 0) {
        log(`Sent audio chunk #${chunkCounter}`);
      }
      chunkCounter += 1;
    });
  }, [apiKey, model, isRecording, startAutoCommitTimer, resetAutoCommitTimer]);

  // Send session update when model changes while WebSocket is connected
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      log('Model changed to:', model, '- sending session update');
      wsRef.current.send(
        JSON.stringify({
          type: 'transcription_session.update',
          input_audio_transcription: {
             model
          }
        })
      );
    }
  }, [model]); // React to model changes

  useEffect(() => {
    return () => {
      // cleanup
      log('Cleaning up hook: closing WebSocket...');
      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
      clearCountdown();
      wsRef.current?.close();
      AudioRecord.stop();
    };
  }, [clearCountdown]);

  return {
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
  };
} 