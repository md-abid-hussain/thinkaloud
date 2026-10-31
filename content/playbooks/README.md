# Playbooks

A playbook tells the generators how to write content for one **type** of project, where the type is what the learner
learns. The type list came from reading all 21 challenge pages.

| File | Type | Projects (ours in bold) |
|---|---|---|
| `streams-and-text.md` | Streams and text | **wc**, **cut**, head, uniq, tr, cat, xxd |
| `language-processing.md` | Language processing | **JSON Parser**, **calculator**, **Brainfuck**, **comment remover**, **grep**, Lisp, Forth, jq |
| `algorithms-and-data-structures.md` | Algorithms and data structures | **sort**, **diff**, **Huffman**, **Bloom filter**, **duplicate files**, password cracker |
| `storage-engines.md` | Storage engines | **Bitcask**, a key-value database |
| `network-protocols.md` | Network protocols | **echo**, **web server**, **Redis**, **curl**, **DNS resolver**, Memcached, NTP |
| `web-services.md` | Web services | **URL shortener**, **rate limiter**, pastebin |
| `developer-tools.md` | Developer tools | **static site generator**, git, make, shell |
| `interactive.md` | Interactive | Pong, Tetris, a text editor |

- `_rules.md` holds the rules every generated item follows, whatever the type.
- Each playbook has the same sections: what the type teaches, what's not wanted, stage 0, step questions, and the check.
- A project gets one main type (`learns`) and at most one more (`also`). The generator reads both playbooks.
- **Examples come from a project of the same type that's outside the test set** (wc, JSON Parser, URL shortener), so a
  generator never copies a test project's answer.
- When an output is wrong, fix the playbook or `_rules.md`, then regenerate every project. Never edit one output by hand.
