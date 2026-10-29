# Build your own static site generator

A command-line tool that turns a folder of Markdown pages and an HTML theme into a static website, and can serve the site locally and refresh it when files change.

Source: https://codingchallenges.fyi/challenges/challenge-ssg · level: beginner · status: generated

## Before you start

A static site generator turns pages written in Markdown, a simple way of marking headings and paragraphs in plain text, into a finished website of HTML files. The look of the site lives in a theme, an HTML file with holes where each page's title and text go. You will build one with commands to create a site, a theme and pages, a build command, and a local server that refreshes when you edit.

Most blogs and documentation sites are plain files on a server. Generating them once, instead of building each page when someone asks for it, makes them fast, cheap and hard to break.

**Example.** After you create a site called mysite, a theme called cc and a page called about, the folder holds content/index.md and content/about.md, written by the author, and themes/cc/index.html, written by the designer. Building fills the theme once per page and writes public/index.html and public/about.html, ready to publish.

## Learning map

### 1. Directory layout as the data model

**Where it shows up here.** The folder structure is the data model: content holds the pages as Markdown, themes hold the templates, and public holds the generated site, so every command works from these conventions.

**How it works.** Many tools avoid configuration by agreeing on where things live. A static site generator typically has a folder of content written in Markdown, a folder of themes or templates that decide how pages look, a folder of static files such as images and stylesheets copied as they are, and an output folder where the finished HTML is written. The structure itself carries meaning: a page at content/blog/first.md becomes the address blog/first on the site, without any list of pages to maintain.

This is called convention over configuration. It makes a new project quick to start, makes every project look the same to anyone who has used the tool, and lets commands such as new page or build work without being told where anything is.

The most important convention is that sources and output are separate. Output is derived data: it can always be produced again from the sources. Keeping it in its own folder means it can be deleted and rebuilt at any time, excluded from version control, and never mistaken for content. When output is written among the sources, the next build may read its own previous output as new content, people may edit generated files by hand and lose the edits on the next build, and generated files end up committed by accident.

**Examples.**
- Hugo and Jekyll both define a fixed directory structure, and a page's path in the content folder becomes its address.
- A project that wrote generated HTML next to its Markdown ended up publishing pages built from earlier generated pages.
- Build tools for many languages keep sources in one folder and compiled output in another that is ignored by version control.

**Misconceptions.**
- Folder layout is just tidiness. In these tools it is the data model that decides what each file is.
- Generated files are part of the project's sources. They are derived and should be rebuildable at any moment.
- Conventions limit what you can build. They remove decisions you would otherwise make for every project.

**Elsewhere.**
- Web frameworks use folder conventions for routes, so a file's path becomes a URL.
- Language build tools separate source folders from build output folders.
- Version control ignore files exist largely to keep derived output out of the repository.

**Read.**
- [Hugo, Directory structure](https://gohugo.io/getting-started/directory-structure/)
- [Jekyll, Directory Structure](https://jekyllrb.com/docs/structure/)
- [Static site generator (Wikipedia)](https://en.wikipedia.org/wiki/Static_site_generator)

**Explain it back.** Explain why a static site generator uses fixed folder names such as content, themes and public, and what goes wrong when generated output is written into the same folder as the sources.

- [ ] Each folder has one role, so no configuration is needed and a page's place in content decides its address on the site
- [ ] People and tools always know where to look for sources, templates and output
- [ ] Output mixed with sources gets picked up again as content by the next build, edited by hand and then overwritten, or committed by mistake
- [ ] A separate output folder can be deleted and rebuilt from the sources at any time

### 2. Command-line arguments and exit codes

**Where it shows up here.** init, new theme, new page, build and serve are subcommands of one tool, each with its own arguments, and an unknown command is reported on standard error with a non-zero exit status.

**How it works.** A command-line tool has a contract with its caller, which is often another program rather than a person. The
contract has three channels.

Standard output carries the result and nothing else, so it can be piped into the next tool or saved to a file.
Standard error carries messages for the person: warnings, usage help and errors. Keeping the two apart means an
error message never ends up inside a file of results.

The exit status, a small number returned when the program ends, says whether it worked. Zero means success and
anything else means failure, and some tools use different values for different problems. Shells, scripts and CI
systems check it, so a step that fails but exits with zero lets a broken build pass.

Arguments complete the contract. Options such as -c and -l choose what to do and can usually be combined, the
remaining words are file names, and an unknown option is an error with a usage message, not something to ignore.
When several files are given and one cannot be read, a well-behaved tool reports that file on standard error,
still processes the others, and exits with a non-zero status at the end.

**Examples.**
- A deploy script runs the tests and checks their exit status. If the tests fail but the command exits with zero, broken code ships.
- A tool that prints its errors on standard output corrupts every report that saves its output to a file.
- GNU wc given three files, one of them missing, prints counts for the two that exist and a total, writes an error about the third on standard error, and exits with status 1.

**Misconceptions.**
- Exit codes are for people to read. They are mainly for other programs.
- Printing an error is enough. Without a non-zero exit status a script cannot tell that anything went wrong.
- Results and error messages can share one stream. Mixing them breaks pipelines.

**Elsewhere.**
- CI systems mark a step as failed purely from its exit status.
- HTTP status codes play the same role for web APIs that exit statuses play for commands.
- Container platforms decide whether to restart a service from how its process exited.

**Read.**
- [Command Line Interface Guidelines](https://clig.dev/)
- [Exit status (Wikipedia)](https://en.wikipedia.org/wiki/Exit_status)
- [Standard streams (Wikipedia)](https://en.wikipedia.org/wiki/Standard_streams)

**Explain it back.** Explain how a tool with subcommands such as init, build and serve should behave when run with a mistyped command, with init on a folder that already exists, and with no arguments at all.

- [ ] A mistyped command gets a message on standard error naming it, perhaps suggesting the closest real command, and a non-zero exit status
- [ ] init on an existing folder refuses rather than overwriting the user's work, unless they explicitly ask to force it
- [ ] With no arguments the tool prints its usage, listing the subcommands
- [ ] Consistent behaviour and exit statuses make the tool safe to use in scripts

### 3. Untrusted names in file paths

**Where it shows up here.** Page names given to new page, and paths requested from the development server, must stay inside the content and public folders.

**How it works.** Whenever a name from outside, such as a URL path, a file name in an upload or a command-line argument, becomes part of a file path, an attacker can choose it. The classic attack is directory traversal: the segment .. means 'the parent folder', so a request for /../../etc/passwd joined naively to a web root climbs out of it and reads a system file.

The safe approach has three parts. First decode the path the way the server will finally interpret it, because attackers hide dots and slashes in percent-encoding such as %2e%2e%2f. Then resolve it against the root folder and normalise it, so that every . and .. is removed and you have one absolute path. Finally check that this absolute path is still inside the root, comparing whole path segments: a root of /srv/www must not accept /srv/www-private, even though the text starts the same way.

Rejecting strings that contain .. is not enough, because encodings, backslashes on Windows, and symbolic links that point outside the root all get around simple text checks. Resolving and then checking containment is what holds. The same rule applies to any code that writes files, where traversal can overwrite configuration or code.

**Examples.**
- A photo service lets users download their files by name, and a request for ../../config/secrets.env returns the server's credentials.
- A filter that removes ../ from paths is beaten by ....// which becomes ../ after the filter runs.
- An archive extractor writes a file named ../../.bashrc outside the target folder, a bug class called Zip Slip.

**Misconceptions.**
- People think browsers and curl will never send .. in a path. They normalise it by default, but an attacker's own client sends whatever bytes it likes.
- People think checking that the resolved path starts with the root text is enough. A sibling folder with a longer name passes that check.
- People think this only matters for reading. Writing to an attacker-chosen path is usually worse.

**Elsewhere.**
- File upload handlers, template loaders and backup restore tools all join untrusted names to folders.
- Path traversal has its own entry in the OWASP and CWE lists of common weaknesses.
- Containers and chroot jails limit the damage, but they are a second line of defence, not a replacement for the check.

**Read.**
- [OWASP, Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [PortSwigger Web Security Academy, Path traversal](https://portswigger.net/web-security/file-path-traversal)

**Explain it back.** Someone runs new page with a name that starts with two sets of dot-dot-slash, and later requests a path with dots from your development server. Explain the risk in each case, and the one check that prevents both.

- [ ] The page name could make the tool write a file outside content, overwriting files that belong to the user
- [ ] The request could make the server read and return files from outside public
- [ ] The fix is to work out the final absolute path, after joining and normalising it, and check that it is still inside the allowed folder
- [ ] Anything outside is refused, rather than trying to strip dots from the text, which attackers can get around with encodings

### 4. Converting Markdown to HTML

**Where it shows up here.** Each Markdown page is converted to HTML: headings, paragraphs, emphasis, links and lists each become HTML elements.

**How it works.** Markdown lets people write formatted text with plain characters: a line starting with a hash is a heading, a blank line separates paragraphs, a line starting with a dash is a list item, and stars or underscores mark emphasis. A converter turns this into HTML elements: headings, paragraphs, lists, emphasis, links and code blocks.

The original description of Markdown was informal and left many cases open. How much indentation turns a line into a code block? Does a list need a blank line before it? What happens when emphasis markers overlap? Different tools answered differently, so the same document could render as a list in one and as a paragraph in another. CommonMark was created to fix this: it is a precise specification with hundreds of numbered examples showing input and exact expected HTML, and most modern converters follow it.

A correct converter works in two phases, like a parser. First it finds the blocks: it reads the document line by line and decides which lines form headings, paragraphs, lists, quotes and code blocks, including blocks nested inside others. Then it processes the inline content of each block, finding emphasis, links and inline code. Doing it with a series of search-and-replace patterns breaks on nesting and edge cases.

The resulting HTML is markup, which matters for safety: if authors are not trusted, raw HTML inside Markdown must be filtered.

**Examples.**
- A README renders as a neat list on one hosting site and as a single run-on paragraph on another because their converters disagree on a blank line.
- Documentation tools, forums and chat apps all convert Markdown to HTML, usually following CommonMark or a close variant.
- A comment system that allowed raw HTML inside Markdown let users inject scripts into other people's pages.

**Misconceptions.**
- Markdown has one agreed definition. The original was informal; CommonMark is the precise version most tools follow.
- Converting Markdown is a few search-and-replace rules. Nesting and edge cases need a real two-phase parse.
- Markdown output is always safe. Markdown allows raw HTML, which must be filtered for untrusted authors.

**Elsewhere.**
- Code hosting sites, wikis and note-taking apps render Markdown.
- Documentation generators turn Markdown or similar markup into whole websites.
- Chat and forum software convert user Markdown to HTML and sanitise it.

**Read.**
- [CommonMark Spec](https://spec.commonmark.org/)
- [Daring Fireball, Markdown Syntax Documentation](https://daringfireball.net/projects/markdown/syntax)
- [CommonMark, Markdown Reference](https://commonmark.org/help/)

**Explain it back.** Two Markdown tools turn the same page into different HTML: one makes a list, the other a plain paragraph. Explain why this happens, and how a specification such as CommonMark helps.

- [ ] The original Markdown description was informal and left many cases open, such as indentation, blank lines and nesting, so tools made different choices
- [ ] CommonMark defines exact rules with hundreds of worked examples, so conforming tools produce the same HTML
- [ ] Converting Markdown is parsing: block structure such as headings, paragraphs and lists first, then inline marks such as emphasis and links, not search and replace

### 5. Template substitution

**Where it shows up here.** The theme's page template has placeholders for the title and the content in double braces, and the build fills them with each page's title and rendered HTML in one pass over the template.

**How it works.** A template separates what a page looks like from what it says. The theme provides an HTML page with placeholders, often written in double braces, for things such as the title and the content. The build replaces each placeholder with a value for the page being generated.

The safe way to substitute is a single pass. Read the template from start to end, copying text to the output, and each time a placeholder appears, write its value and continue after the placeholder. Inserted values are never scanned again. Substituting one placeholder after another with repeated replace operations instead re-scans text that was already inserted: if a page's own text contains the name of another placeholder, it gets replaced too, and a page can end up containing its own body twice, or worse, text an author did not intend.

Two more decisions make templates robust. The first is what to do with a placeholder the template uses but no value exists for: silently writing nothing hides typos in themes, so many engines report it or show a visible marker. The second is escaping: a value that is plain text, such as a title, must be escaped for HTML when it is inserted, while a value that is already HTML, such as rendered Markdown, must be inserted as it is. Template engines usually escape by default and need an explicit mark for trusted HTML.

**Examples.**
- A blog post that quoted the theme's own placeholder syntax came out with its body pasted in a second time.
- Email templates with a misspelled placeholder sent customers messages with a blank where their name should be.
- Template engines used by web frameworks escape inserted text by default to prevent script injection.

**Misconceptions.**
- Replacing each placeholder in turn is the same as substituting once. Repeated replacing re-scans inserted text.
- Missing values should quietly become empty. That hides typos in templates.
- Every value should be inserted the same way. Text needs escaping, while trusted HTML must not be escaped.

**Elsewhere.**
- Web frameworks render HTML pages from templates on every request.
- Email, invoice and report generators fill templates with data.
- Configuration tools and deployment systems fill templated configuration files with values.

**Read.**
- [Template processor (Wikipedia)](https://en.wikipedia.org/wiki/Template_processor)
- [mustache(5), Logic-less templates](https://mustache.github.io/mustache.5.html)
- [Hugo, Introduction to templating](https://gohugo.io/templates/introduction/)

**Explain it back.** A page whose text happens to mention the content placeholder, in double braces, shows up after the build with its body pasted in twice. Explain the bug, and how substituting in a single pass avoids it.

- [ ] Replacing one placeholder after another re-scans text that has already been inserted, so a placeholder inside a page's own text gets replaced again
- [ ] A single pass reads the template once and replaces each placeholder with its value, and never scans inserted values
- [ ] An unknown placeholder should be reported, or at least made visible, so typos in a theme are caught

### 6. Escaping text inserted into HTML

**Where it shows up here.** The title comes from the page's text and is inserted into HTML, so characters such as less-than and ampersand must be escaped. The rendered Markdown body is already HTML and goes in as it is.

**How it works.** HTML gives a few characters special meaning. A less-than sign starts a tag, an ampersand starts a character reference, and quotes end attribute values. When plain text is inserted into HTML without change, any of these characters in the text are read as markup. At best the page layout breaks; at worst, a value containing a script tag is run by every reader's browser. That second case is called cross-site scripting, and it lets an attacker act as the reader on the site.

Escaping replaces each special character with a character reference that displays the same character without its markup meaning: the less-than sign becomes ampersand-l-t-semicolon, the ampersand becomes ampersand-a-m-p-semicolon, and quotes become their own references. The browser shows the original text, and nothing is interpreted.

The right escaping depends on where the value lands. Text between tags needs the less-than sign and ampersand escaped. A value inside an attribute also needs quotes escaped, and the attribute must be quoted. Values placed inside scripts, styles or addresses need different rules again, which is why the safest designs avoid putting untrusted text there at all.

The other half of the rule is knowing what is already HTML. Rendered Markdown is markup on purpose and must not be escaped, or readers see tags as text. A design that keeps track of which values are text and which are markup, and escapes text at the moment it is inserted, prevents both mistakes.

**Examples.**
- A page titled with an ampersand and a less-than sign broke a site's layout because the title went into the page without escaping.
- A guest author put a script tag in a post title, and every visitor's browser ran it.
- Escaping the rendered Markdown body by mistake made readers see angle-bracket tags instead of formatted text.

**Misconceptions.**
- Only user input needs escaping. Any text from outside the template, including your own content files, does.
- One escaping function fits everywhere. Text, attributes, scripts and addresses each need their own rules.
- Escaping everything is safe. Escaping a value that is meant to be HTML breaks it.

**Elsewhere.**
- Web frameworks escape template values by default for exactly this reason.
- SQL uses parameters instead of pasting values into queries, the same idea for a different language.
- Shell commands and log files need their own escaping when untrusted text is inserted.

**Read.**
- [OWASP, Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [MDN, Character reference](https://developer.mozilla.org/en-US/docs/Glossary/Character_reference)
- [OWASP, Cross Site Scripting (XSS)](https://owasp.org/www-community/attacks/xss/)

**Explain it back.** A page titled with a less-than sign and an ampersand breaks your site's layout, and a guest author's title runs a script in readers' browsers. Explain both problems, and the rule that fixes them.

- [ ] Characters that mean something in HTML, such as less-than, greater-than, ampersand and quotes, are read as markup when inserted raw, which breaks the page
- [ ] A title containing a script tag is run by the browser, which is cross-site scripting
- [ ] Text is escaped for the place it goes, replacing those characters with character references, in body text and in attribute values
- [ ] Values that are meant to be HTML, such as rendered Markdown, are not escaped, so the code must know which values are text and which are markup

### 7. Build pipeline

**Where it shows up here.** build reads every content page, renders it, fills the template and writes it to public, after clearing old output, so the output always matches the sources.

**How it works.** A build pipeline is the sequence of steps that turns sources into output. For a static site it is: find every content file, read it, convert its Markdown to HTML, fill the template, and write the result to the output folder, alongside copies of static files such as images.

Two properties make a build trustworthy. It should be repeatable: running it twice on the same sources gives the same output, so the result never depends on what happened before. And it should be complete: the output reflects exactly the current sources. A build that only writes files and never removes them fails the second test, because when a page is renamed or deleted, its old output stays and is published. The simple fix is a clean build that clears the output folder first. The faster fix, used by large sites, is to track which output came from which source and remove the outputs whose sources are gone.

Splitting the pipeline into clear stages with simple inputs and outputs helps in three ways. Each stage can be tested on its own. A failure points at one stage. And incremental builds become possible: if nothing a page depends on has changed, its stage can be skipped. Incremental builds need dependency tracking, since a page depends not only on its own file but also on the template, and a template change must rebuild every page.

**Examples.**
- A renamed page stayed online under its old address for months because the build never removed old output.
- Make and similar build tools rebuild only targets whose sources changed, using timestamps and declared dependencies.
- A site that rebuilt only changed pages showed old navigation everywhere after the template changed, because pages were not marked as depending on it.

**Misconceptions.**
- If the build succeeded, the output is correct. Stale files from earlier builds can remain.
- A clean build is wasteful. It is the simplest way to be sure the output matches the sources; incremental builds are an optimisation.
- A page depends only on its own source file. It also depends on templates and shared data.

**Elsewhere.**
- Compilers and bundlers run multi-stage build pipelines.
- Continuous integration runs builds from a clean checkout to be sure they are repeatable.
- Data pipelines transform raw data into reports through similar stages.

**Read.**
- [Static site generator (Wikipedia)](https://en.wikipedia.org/wiki/Static_site_generator)
- [Make (software) (Wikipedia)](https://en.wikipedia.org/wiki/Make_(software))
- [Idempotence (Wikipedia)](https://en.wikipedia.org/wiki/Idempotence)

**Explain it back.** After you rename about.md to team.md and build again, both about.html and team.html are on your site. Explain why, and how a build should work so that its output always matches the sources.

- [ ] The build only writes files and never removes them, so the output of a renamed or deleted page stays behind
- [ ] Clearing the output first, or tracking and deleting files with no source, makes the result depend only on the current sources
- [ ] A good build is repeatable: running it twice on the same sources gives the same output
- [ ] Splitting it into clear stages, read, convert, apply the template and write, makes it easy to debug and to rebuild only what changed

### 8. Serving static files over HTTP

**Where it shows up here.** serve maps / to index.html and other paths to files under public, with the right content type, and answers 404 for missing files.

**How it works.** A static file server maps the path in a request to a file under a root folder and sends its bytes back. By convention a path ending in a slash maps to an index file, usually index.html. If nothing matches, the server answers 404 Not Found.

Two headers matter most. Content-Type tells the client what the bytes are, as a media type such as text/html, image/png or application/javascript, sometimes with a charset parameter such as text/html; charset=utf-8. Browsers decide how to treat a response from this header, not from the file name, so a stylesheet sent as text/plain is ignored. Content-Length gives the body's size in bytes, which lets the client know where the body ends.

Files should be read and sent as bytes, never decoded and re-encoded as text, because an image is not text and even a text file's byte count is what Content-Length needs. Real servers add more: caching headers so browsers do not refetch unchanged files, range requests for large media, and a sensible default when the extension is unknown, usually application/octet-stream, which makes browsers download rather than display.

**Examples.**
- A site's CSS has no effect because the server sends it with Content-Type text/plain, and the browser refuses to apply it.
- A server that reads images as text corrupts every PNG it serves.
- Visiting a folder path such as /docs/ returns /docs/index.html, so the address can stay short.

**Misconceptions.**
- People think browsers trust the file extension. They trust the Content-Type header.
- People think Content-Length is the number of characters. It is the number of bytes in the body.
- People think a missing file should crash the handler or return 500. It is the client asking for something that does not exist, so it is 404.

**Elsewhere.**
- CDNs and object storage services such as S3 are static file servers at scale, with the same Content-Type rules.
- Front-end build tools produce folders of static files meant to be served exactly this way.
- Download links that open as gibberish in the browser are usually a wrong Content-Type.

**Read.**
- [MDN, Media types (MIME types)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types)
- [MDN, Content-Type header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Type)
- [MDN, Content-Length header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Length)

**Explain it back.** Your development server shows a page, but the browser downloads the stylesheet instead of applying it. Explain what the server forgot and how it should decide.

- [ ] Every response needs a Content-Type header that matches the file, such as text/css for a stylesheet and text/html for a page
- [ ] The type is chosen from the file's extension, using a table of media types
- [ ] With a wrong or missing type the browser treats the file as unknown data, offers to download it, or refuses to apply it
- [ ] A folder path maps to its index.html, and a missing file gets a 404

### 9. Watching files for changes

**Where it shows up here.** serve watches the content and theme folders and rebuilds the site when a file changes.

**How it works.** A tool that rebuilds when files change needs to know when they change. There are two ways. Polling checks the files' modification times every so often: simple, portable and reliable, but slower to react and wasteful on large trees. Notification asks the operating system to report changes as they happen: Linux has inotify, macOS has FSEvents and Windows has ReadDirectoryChangesW. Notifications are fast and cheap, but each has its own rules.

Three practical problems appear with notifications. First, one save is rarely one event. Many editors save safely by writing a temporary file and renaming it over the original, and they may also update metadata, so a single save produces a burst of create, modify and rename events. Reacting to each event rebuilds several times. The fix is to debounce: wait until no events have arrived for a short quiet period, such as a tenth of a second, then rebuild once. Second, watches are often per folder. A new subfolder may not be watched until the tool adds it, so new pages there are missed unless the watcher notices new folders or falls back to polling. Third, the tool's own output must be excluded, or writing the build output triggers another build, endlessly.

Notifications can also be lost when many changes happen at once, so robust tools occasionally rescan to catch up.

**Examples.**
- A development server rebuilt a site three times for every save because the editor wrote a temporary file, renamed it and touched the metadata.
- A watcher that wrote its output inside a watched folder rebuilt itself in an endless loop.
- Test runners re-run tests on save using the same watching techniques.

**Misconceptions.**
- One save produces one change event. It usually produces several.
- Watching a folder covers everything inside it forever. New subfolders may need to be added explicitly.
- Notifications are never lost. Under heavy load they can be, so tools rescan from time to time.

**Elsewhere.**
- Build tools, test runners and bundlers in watch mode rely on file notifications.
- File synchronisation services watch folders to upload changes.
- Editors notice when another program changes a file they have open.

**Read.**
- [inotify(7), Linux manual page](https://man7.org/linux/man-pages/man7/inotify.7.html)
- [inotify (Wikipedia)](https://en.wikipedia.org/wiki/Inotify)
- [Microsoft Learn, ReadDirectoryChangesW function](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw)

**Explain it back.** Your watcher rebuilds the site three times every time you save one file, and sometimes misses changes in a new subfolder. Explain why, and how to make watching reliable.

- [ ] Editors often save in several steps, such as writing a temporary file and renaming it, and each step produces its own change event
- [ ] Waiting for a short quiet period after the last event, then rebuilding once, turns the burst into one rebuild
- [ ] Operating-system watchers, such as inotify on Linux, watch specific folders, so new subfolders must be added as they appear, or the tool falls back to checking modification times
- [ ] The output folder must be ignored, or each rebuild triggers the next

### 10. Pushing a reload to the browser

**Where it shows up here.** After each rebuild the server tells open browser pages to reload, over a long-lived connection such as server-sent events, using a small script added only by the development server.

**How it works.** Ordinary HTTP is request and response: the browser asks and the server answers. A server cannot reach out to a browser on its own, so to tell an open page that the site has changed, the page must first open a connection that stays open.

Server-sent events are the simplest way. The page runs a small script that opens a connection to a special address on the development server. The server keeps the response open and writes a short text message down it whenever it wants, and the browser delivers each message to the script. After a rebuild, the server sends a reload message and the script reloads the page. If the connection drops, for example because the server restarted, the browser reconnects automatically. WebSockets offer a two-way channel and work too, but are more than a reload signal needs.

The reload script belongs only to development. A good design adds it while serving, for instance by inserting a script tag into each HTML page as the development server sends it, and never writes it into the files the build produces. A published site that carried the script would keep trying to connect to a server that does not exist, filling readers' browsers with errors.

Two details help: send the reload only after the build has finished writing, and tell the browser not to cache the pages during development, or it may reload an old copy.

**Examples.**
- Front-end development servers reload or patch the page in the browser a moment after a file is saved.
- A site accidentally published with its live-reload script made every visitor's browser retry a connection to a missing development server.
- Dashboards use server-sent events to push new numbers to open pages without the page asking repeatedly.

**Misconceptions.**
- The server can simply tell the browser to reload. HTTP needs the browser to open the connection first.
- A WebSocket is required. Server-sent events are simpler and enough for a one-way reload signal.
- Adding the script to the template is fine. It must be added only by the development server.

**Elsewhere.**
- Live dashboards, notifications and progress updates use server-sent events or WebSockets.
- Chat applications keep long-lived connections to receive messages as they arrive.
- Streaming responses from AI services are often delivered as server-sent events.

**Read.**
- [MDN, Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [HTML Standard, Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN, WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

**Explain it back.** Explain how a development server can make an open browser tab reload when the site is rebuilt, why it cannot do so without a connection the page opened first, and why the reload script must not end up in the published site.

- [ ] HTTP is request and response, so a server cannot contact a browser on its own
- [ ] The page opens a long-lived connection, such as server-sent events or a WebSocket, and the server sends a message on it after each rebuild, which makes the page reload
- [ ] The development server adds the reload script only when it serves pages, so the files written by build stay clean
- [ ] A published page with the script would keep trying to reach a development server that does not exist

## Build plan

**Reference tool.** The CommonMark specification and its worked examples for rendered Markdown, and a browser's developer tools for what the development server sends.

### Milestone 1: Project layout and commands

Create a project, a theme and pages from the command line, with safe names and clear errors.

**1.1 Create a project** (45 min · site-directory-layout, cli-subcommands)

Make init mysite create the project folder with content/index.md, and refuse to overwrite an existing folder. Then make new theme cc create themes/cc/index.html, and new page about create content/about.md.

*Outcome:* Those three commands create exactly those files, and init on a folder that already exists refuses with a message and a non-zero exit status.

*Hint:* Write down the folder tree you expect after each command before you build it.

**1.2 Subcommands and safe names** (30 min · cli-subcommands, untrusted-paths)

Reject page names that would leave content, and make an unknown command print a message on standard error and exit with a non-zero status.

*Outcome:* A page name that climbs out of content with dots is refused and nothing is written, and a mistyped command prints a message on standard error and exits non-zero.

*Hint:* Check the final resolved path, not the text the user typed.

### Milestone 2: Templates and build

Render Markdown, fill the template safely, and build the whole site into public.

**2.1 Render Markdown** (45 min · markup-to-html)

Render headings and paragraphs from a content page to HTML, then add any other Markdown features you want, checking each against examples from the CommonMark specification.

*Outcome:* A sample page with headings and paragraphs, plus each feature you added, renders to the HTML its CommonMark examples show.

*Hint:* Find the blocks first, such as headings and paragraphs, and only then look inside them for emphasis and links.

**2.2 Fill the template** (45 min · template-substitution)

Fill the title placeholder with the page's first top-level heading and the content placeholder with the rendered HTML, in a single pass over the template.

*Outcome:* A built page shows its own title and body, and a page whose text mentions a placeholder name is not substituted a second time.

*Hint:* Write each value into the output once, and never look at it again.

**2.3 Escape what you insert** (30 min · output-escaping)

Escape the title before it goes into the template, and leave the rendered body as HTML.

*Outcome:* A title containing a less-than sign and an ampersand displays exactly as written, and a title containing a script tag shows as text and runs nothing.

*Hint:* Which of the values you insert is text, and which is already HTML?

**2.4 Build into public** (45 min · build-pipeline, site-directory-layout)

Make build render every content page into public, for example about.md into public/about.html, after clearing old output.

*Outcome:* build writes one HTML file per content page, and after you rename a page and build again, no stale file is left in public.

*Hint:* Delete the output from the last build before writing the new one, or track which outputs belong to which sources.

### Milestone 3: Development server and live reload

Serve the site locally, keep requests inside public, rebuild on change and reload the browser.

**3.1 Serve the public folder** (45 min · static-file-serving)

Serve public on a local port, mapping / to index.html, sending the right content type for each file and answering 404 for missing files.

*Outcome:* The site appears in a browser with its stylesheet applied, / shows index.html, and a missing page gets a 404.

*Hint:* Look at the response headers in the browser's developer tools.

**3.2 Keep requests inside the folder** (30 min · untrusted-paths)

Refuse any request whose resolved path is outside public.

*Outcome:* Requests that climb out of public with dots, plain or percent-encoded and sent with curl --path-as-is, never return a file from outside it.

*Hint:* Decode the request path first, then resolve it, then check it.

**3.3 Rebuild on change** (45 min · file-watching, build-pipeline)

Rebuild the site when a content or theme file changes, waiting for a short quiet period so one save causes one rebuild.

*Outcome:* Saving a content or theme file triggers exactly one rebuild within a couple of seconds, and a new page in a new subfolder is picked up too.

*Hint:* Log every change event you receive for one save, and look at how many there are.

**3.4 Reload the browser** (60 min · live-reload-push)

Tell open browser pages to reload after each rebuild, for example over a server-sent events connection opened by a small script that the development server adds to the pages it serves.

*Outcome:* An open page reloads by itself after you save a content file, and the files written by build contain no reload script.

*Hint:* Who opens the connection, and who sends the message on it?

## Open checks

- Which Markdown features beyond headings and paragraphs you will support, and which CommonMark examples you test against.
- How many change events one save in your editor produces on your system.
- Whether your browser shows a cached page after a reload, and which headers your development server should send to prevent it.
- What a page name containing spaces or accented letters should become as a file name and an address.

## Done when

init, new theme, new page, build and serve all work; every content page builds into public with its title escaped and no stale files left behind; the development server serves the right content types, stays inside public, rebuilds once per save and reloads open pages; and the built site contains no development script. Your notes explain the layout, the single-pass template and your escaping rule in your own words.
