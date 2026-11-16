/** Machine-readable Node test events; percentages are taken from native coverage only. */
export default async function* reporter(events) {
  for await (const event of events) {
    if (['test:coverage', 'test:fail', 'test:summary', 'test:diagnostic', 'test:stderr'].includes(event.type)) yield `${JSON.stringify(event)}\n`;
  }
}
