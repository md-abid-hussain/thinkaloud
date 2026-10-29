// Proofs for the predict and trace keys of challenge-ssg. Each function works the answer out from the
// situation described in the prompt and returns it. import-content.mjs --check runs them and compares.

// The files each command creates, using the layout after the challenge's step 3.
function filesAfter(commands) {
  const files = new Set();
  for (const [cmd, arg] of commands) {
    if (cmd === 'init') files.add('content/index.md');
    if (cmd === 'theme') files.add(`themes/${arg}/index.html`);
    if (cmd === 'page') files.add(`content/${arg}.md`);
  }
  return files.size;
}

// Markdown blocks are separated by blank lines. A line starting with # is a heading, anything else a paragraph.
const blocks = (md) => md.split(/\n\s*\n/).filter((b) => b.trim()).map((b) => (b.startsWith('#') ? 'h1' : 'p'));

// The buggy build: replace Content first, then every Title.
function buggyFill(template, values) {
  return template.replaceAll('{{ Content }}', values.Content).replaceAll('{{ Title }}', values.Title);
}

// A build that only writes files and never clears the output folder.
function buildWithoutClearing(builds) {
  const pub = new Set();
  for (const pages of builds) for (const page of pages) pub.add(page.replace(/\.md$/, '.html'));
  return pub.size;
}

// The usual types a static server sends, from MDN's list of common MIME types.
const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript', png: 'image/png' };

// Rebuild on every event, or once per burst with a wait of `wait` ms after the last event.
function rebuilds(eventTimes, wait) {
  if (wait === 0) return eventTimes.length;
  let count = 0;
  for (let i = 0; i < eventTimes.length; i++) {
    const next = eventTimes[i + 1];
    if (next === undefined || next - eventTimes[i] >= wait) count++;
  }
  return count;
}

export const proofs = {
  '1.1': () => filesAfter([['init', 'mysite'], ['theme', 'cc'], ['page', 'about']]),
  '2.1': () => blocks('# Title\n\nFirst paragraph.\n\nSecond paragraph.\n').length,
  '2.2': () => {
    const html = buggyFill('<h1>{{ Title }}</h1>{{ Content }}', { Title: 'Home', Content: '<p>Welcome to {{ Title }}</p>' });
    return html.split('Home').length - 1;
  },
  '2.4': () => buildWithoutClearing([['index.md', 'about.md', 'blog.md'], ['index.md', 'about.md']]),
  '3.1': () => TYPES['about.html'.split('.').pop()],
  '3.4': () => [rebuilds([0, 20, 50], 0), rebuilds([0, 20, 50], 200)],
};
