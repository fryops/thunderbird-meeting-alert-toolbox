export interface BrowserLauncher {
  open(url: string): Promise<void>;
}
