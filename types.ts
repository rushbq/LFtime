
export enum AppFeature {
  ArmsRace = 'ArmsRace',
  TimeAssistant = 'TimeAssistant',
}

export enum AppMode {
  TimeDifference = 'TimeDifference',
  TimeAddition = 'TimeAddition',
  GameTimeConverter = 'GameTimeConverter',
}

export interface TimeDuration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export enum ConversionDirection {
  GameToReal = 'GameToReal',
  RealToGame = 'RealToGame',
}
