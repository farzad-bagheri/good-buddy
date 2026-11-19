const SLOW_RESPONSE_DELAY_MS = 30_000;

export function createSlowResponseWarning(onChange: (visible: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    onChange(false);
  }

  return {
    start() {
      stop();
      timer = setTimeout(() => {
        timer = undefined;
        onChange(true);
      }, SLOW_RESPONSE_DELAY_MS);
    },
    stop,
  };
}
