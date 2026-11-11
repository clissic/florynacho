let audio: HTMLAudioElement | null = null;

export function bindAudio(element: HTMLAudioElement | null) {
  audio = element;
}

export function startMusicFromGesture() {
  if (!audio || sessionStorage.getItem('fi-player-paused') === '1') return;
  audio.muted = false;
  void audio.play();
}

export function pauseMusic() {
  sessionStorage.setItem('fi-player-paused', '1');
  audio?.pause();
}
