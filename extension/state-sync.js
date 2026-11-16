/** Read-only local state polling. Never overlaps requests or queues missed ticks.
 * @param {{refresh:()=>Promise<void>,onError:(error:Error)=>void,isVisible:()=>boolean,isBusy:()=>boolean,setInterval:Function,clearInterval:Function}} platform */
export function createStateSync(platform) {
  let disposed = false;
  let inFlight = null;
  const request = () => {
    if (disposed || !platform.isVisible() || platform.isBusy()) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(platform.refresh).catch(platform.onError).finally(() => { inFlight = null; });
    return inFlight;
  };
  const timer = platform.setInterval(() => { void request(); }, 2000);
  return {
    request,
    dispose() {
      disposed = true;
      platform.clearInterval(timer);
    }
  };
}
