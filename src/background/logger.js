let buffer = [];
try { buffer = JSON.parse(globalThis.__crashbridgeLogBuffer ?? '[]'); } catch { buffer = []; }

function write(source, event, details) {
  const entry = `[${new Date().toISOString()}] [${source}] ${event}${details && Object.keys(details).length ? ' ' + JSON.stringify(details) : ''}`;
  buffer.push(entry);
  if (buffer.length > 500) buffer = buffer.slice(-500);
  globalThis.__crashbridgeLogBuffer = JSON.stringify(buffer);
  if (typeof console !== 'undefined') console.info(entry);
}

export const log = (event, details = {}) => write('queue', event, details);
export const logCapture = (event, details = {}) => write('capture', event, details);
export const remoteLog = (event, details) => write('content', event, details);

export function toMarkdown() {
  return `# CrashBridge 诊断日志\n\n仅记录事件、状态码和错误码，不包含堆栈、Issue 标题、ID 或用户数据。\n\n\`\`\`\n${buffer.join('\n')}\n\`\`\`\n`;
}

export function size() { return buffer.length; }
