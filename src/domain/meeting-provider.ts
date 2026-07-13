export interface MeetingProvider {
  readonly id: string;
  readonly displayName: string;
  readonly icon: string;
  readonly detectionPatterns: readonly RegExp[];
  validate(url: string): boolean;
  normalize(url: string): string;
}
