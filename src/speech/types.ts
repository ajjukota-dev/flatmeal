export type SarvamSpeechToTextModel = "saarika:v2.5" | "saaras:v3";
export type SarvamSpeechToTextMode = "transcribe" | "translate" | "verbatim" | "translit" | "codemix";
export type SarvamSpeechToTextLanguage =
  | "unknown"
  | "hi-IN"
  | "bn-IN"
  | "kn-IN"
  | "ml-IN"
  | "mr-IN"
  | "od-IN"
  | "pa-IN"
  | "ta-IN"
  | "te-IN"
  | "en-IN"
  | "gu-IN"
  | "as-IN"
  | "ur-IN"
  | "ne-IN"
  | "kok-IN"
  | "ks-IN"
  | "sd-IN"
  | "sa-IN"
  | "sat-IN"
  | "mni-IN"
  | "brx-IN"
  | "mai-IN"
  | "doi-IN";

export type SarvamInputAudioCodec =
  | "wav"
  | "x-wav"
  | "wave"
  | "mp3"
  | "mpeg"
  | "mpeg3"
  | "x-mp3"
  | "x-mpeg-3"
  | "aac"
  | "x-aac"
  | "aiff"
  | "x-aiff"
  | "ogg"
  | "opus"
  | "flac"
  | "x-flac"
  | "mp4"
  | "x-m4a"
  | "amr"
  | "x-ms-wma"
  | "webm"
  | "pcm_s16le"
  | "pcm_l16"
  | "pcm_raw";

export type SarvamTextToSpeechLanguage =
  | "bn-IN"
  | "en-IN"
  | "gu-IN"
  | "hi-IN"
  | "kn-IN"
  | "ml-IN"
  | "mr-IN"
  | "od-IN"
  | "pa-IN"
  | "ta-IN"
  | "te-IN";

export type SarvamTextToSpeechModel = "bulbul:v2" | "bulbul:v3";
export type SarvamSpeechSampleRate = "8000" | "16000" | "22050" | "24000" | "32000" | "44100" | "48000";
export type SarvamOutputAudioCodec = "mp3" | "linear16" | "mulaw" | "alaw" | "opus" | "flac" | "aac" | "wav";

export type TranscribeAudioInput = {
  data: Blob;
  filename: string;
  model?: SarvamSpeechToTextModel;
  mode?: SarvamSpeechToTextMode;
  languageCode?: SarvamSpeechToTextLanguage;
  inputAudioCodec?: SarvamInputAudioCodec;
};

export type TranscriptionResult = {
  requestId: string | null;
  transcript: string;
  languageCode: string | null;
  languageProbability?: number | null;
};

export interface SpeechToTextProvider {
  transcribe(input: TranscribeAudioInput): Promise<TranscriptionResult>;
}

export type TextToSpeechInput = {
  text: string;
  targetLanguageCode: SarvamTextToSpeechLanguage;
  model?: SarvamTextToSpeechModel;
  speaker?: string;
  pace?: number;
  speechSampleRate?: SarvamSpeechSampleRate;
  outputAudioCodec?: SarvamOutputAudioCodec;
  temperature?: number;
};

export type TextToSpeechResult = {
  requestId: string | null;
  audioBase64: string;
  audio: Buffer;
};

export interface TextToSpeechProvider {
  synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult>;
}
