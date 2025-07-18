
export enum AppMode {
  TimeDifference = 'TimeDifference',
  TimeAddition = 'TimeAddition',
  GameTimeConverter = 'GameTimeConverter',
  OffsetDisplay = 'OffsetDisplay',
}

export interface TimeDuration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface GroundingChunkWeb {
  uri: string;
  title: string;
}

export interface GroundingChunk {
  web?: GroundingChunkWeb;
  // Other types of chunks can be added here if needed
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  // Other grounding metadata fields
}

export interface Candidate {
  groundingMetadata?: GroundingMetadata;
  // Other candidate fields
}

export interface GenerateContentResponseWithGrounding {
  text: string;
  candidates?: Candidate[];
  // Other fields from GenerateContentResponse that might be relevant
}

export enum ConversionDirection {
  GameToReal = 'GameToReal',
  RealToGame = 'RealToGame',
}
