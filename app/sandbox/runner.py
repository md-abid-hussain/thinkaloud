"""ThinkAloud's harness inside the sandbox. Standard library only, so it runs on the plain sandbox image.

  python3 runner.py detect REPO_DIR    proposes build and run commands for the learner to confirm
  python3 runner.py check SPEC_JSON    prepares fixtures, runs one step's check, prints the results

Results are printed as one line starting with RESULT_MARK, so build noise around it doesn't matter.
The check kinds (cli, case-files, script, http, socket, client) match app/lib/gen/schema.ts.
"""
import glob
import json
import os
import re
import shlex
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import zipfile

RESULT_MARK = "@@THINKALOUD@@"
UA = "Mozilla/5.0 ThinkAloud-sandbox"
LAUNCH_ERRORS = re.compile(
    r"Could not find or load main class|ClassNotFoundException|ModuleNotFoundError|No module named|"
    r"Cannot find module|command not found|can't open file|Error: Unable to access jarfile"
)


def emit(obj):
    print(RESULT_MARK + json.dumps(obj))


def tail(text, n=1500):
    text = text or ""
    return text if len(text) <= n else "..." + text[-n:]


# ---------- detect ----------

def java_main_class(src_roots):
    for root in src_roots:
        for path in sorted(glob.glob(os.path.join(root, "**", "*.java"), recursive=True)):
            try:
                text = open(path, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            if re.search(r"static\s+(public\s+)?void\s+main\s*\(", text):
                pkg = re.search(r"^\s*package\s+([\w.]+)\s*;", text, re.M)
                name = os.path.splitext(os.path.basename(path))[0]
                return f"{pkg.group(1)}.{name}" if pkg else name
    return None


def python_entry(repo):
    for pkg_main in sorted(glob.glob(os.path.join(repo, "*", "__main__.py"))):
        return f"python3 -m {os.path.basename(os.path.dirname(pkg_main))}"
    for name in ("main.py", "app.py", "cli.py", "server.py"):
        if os.path.exists(os.path.join(repo, name)):
            return f"python3 {name}"
    for path in sorted(glob.glob(os.path.join(repo, "**", "*.py"), recursive=True)):
        if "/test" in path.replace(repo, "") or "/." in path.replace(repo, ""):
            continue
        if re.search(r"^if __name__ == ['\"]__main__['\"]", open(path, encoding="utf-8", errors="replace").read(), re.M):
            return f"python3 {os.path.relpath(path, repo)}"
    return None


def node_entry(repo, pkg):
    bin_ = pkg.get("bin")
    if isinstance(bin_, str):
        return f"node {bin_}"
    if isinstance(bin_, dict) and bin_:
        return f"node {next(iter(bin_.values()))}"
    start = (pkg.get("scripts") or {}).get("start", "")
    m = re.match(r"^node\s+(\S+)$", start.strip())
    if m:
        return f"node {m.group(1)}"
    if start:
        return "npm start --silent --"
    if pkg.get("main"):
        return f"node {pkg['main']}"
    for name in ("index.js", "server.js", "app.js", "main.js", "src/index.js"):
        if os.path.exists(os.path.join(repo, name)):
            return f"node {name}"
    return None


def detect(repo):
    notes = []
    has = lambda name: os.path.exists(os.path.join(repo, name))
    if has("pom.xml"):
        main = java_main_class([os.path.join(repo, "src", "main", "java")])
        build = "mvn -q -B -DskipTests package dependency:copy-dependencies -DoutputDirectory=target/lib"
        run = f'java -cp "target/classes:target/lib/*" {main}' if main else None
        return {"language": "java", "tool": "maven", "build": build, "run": run, "notes": notes}
    if has("build.gradle") or has("build.gradle.kts"):
        gradle = "./gradlew" if has("gradlew") else "gradle"
        text = open(os.path.join(repo, "build.gradle" if has("build.gradle") else "build.gradle.kts"), encoding="utf-8").read()
        main = java_main_class([os.path.join(repo, "src", "main", "java"), os.path.join(repo, "app", "src", "main", "java")])
        if gradle == "gradle":
            notes.append("No Gradle wrapper (gradlew) in the repo, and the sandbox has no Gradle. Add the wrapper.")
        if "application" in text:
            return {"language": "java", "tool": "gradle", "build": f"chmod +x gradlew 2>/dev/null; {gradle} -q installDist -x test",
                    "run": "$(ls -d build/install/*/bin/* app/build/install/*/bin/* 2>/dev/null | grep -v '\\.bat$' | head -1)", "notes": notes}
        return {"language": "java", "tool": "gradle", "build": f"chmod +x gradlew 2>/dev/null; {gradle} -q build -x test",
                "run": f"java -cp build/classes/java/main {main}" if main else None, "notes": notes}
    if glob.glob(os.path.join(repo, "**", "*.java"), recursive=True):
        main = java_main_class([repo])
        return {"language": "java", "tool": "javac", "build": "mkdir -p out && javac -d out $(find . -name '*.java' -not -path './out/*')",
                "run": f"java -cp out {main}" if main else None, "notes": notes}
    if has("package.json"):
        pkg = json.load(open(os.path.join(repo, "package.json"), encoding="utf-8"))
        build = "(npm ci --silent || npm install --silent) && npm run build --if-present --silent"
        return {"language": "node", "tool": "npm", "build": build, "run": node_entry(repo, pkg), "notes": notes}
    if has("pyproject.toml") or has("requirements.txt") or glob.glob(os.path.join(repo, "**", "*.py"), recursive=True):
        build = None
        if has("requirements.txt"):
            build = "pip install -q -r requirements.txt"
        elif has("pyproject.toml"):
            build = "pip install -q ."
        return {"language": "python", "tool": "pip" if build else "none", "build": build, "run": python_entry(repo), "notes": notes}
    notes.append("No Java, Python or Node.js project found at the top of the repo.")
    return {"language": None, "tool": None, "build": None, "run": None, "notes": notes}


# ---------- fixtures ----------

def download_url(source):
    if "dropbox.com" in source:
        source = re.sub(r"([?&])dl=0", r"\1dl=1", source)
        if "dl=1" not in source:
            source += ("&" if "?" in source else "?") + "dl=1"
    return source


def fetch(url, attempts=4):
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(download_url(url), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - any network error is retried
            last = e
            time.sleep(1 + i)
    raise RuntimeError(f"could not download {url}: {last}")


def prepare_fixtures(fixtures, into):
    os.makedirs(into, exist_ok=True)
    for f in fixtures:
        target = os.path.join(into, f["name"])
        os.makedirs(os.path.dirname(target), exist_ok=True)
        if f.get("content") is not None:
            with open(target, "w", encoding="utf-8", newline="") as out:
                out.write(f["content"])
            continue
        data = fetch(f["source"])
        if data[:4] == b"PK\x03\x04":
            path = target + ".zip"
            open(path, "wb").write(data)
            with zipfile.ZipFile(path) as z:
                for member in z.namelist():
                    if member.startswith("__MACOSX") or ".." in member:
                        continue
                    z.extract(member, into)
            os.remove(path)
            if not os.path.exists(target):
                os.makedirs(target, exist_ok=True)
        else:
            open(target, "wb").write(data)


def sub_fixtures(text, fixtures_dir):
    return re.sub(r"\{fixture:([^}]+)\}", lambda m: os.path.join(fixtures_dir, m.group(1)), text)


# ---------- running the learner's program ----------

def run(cmd, cwd, env, stdin_path=None, timeout=30):
    stdin = open(stdin_path, "rb") if stdin_path else subprocess.DEVNULL
    try:
        p = subprocess.run(["bash", "-c", cmd], cwd=cwd, env=env, stdin=stdin, capture_output=True, timeout=timeout)
        return p.returncode, p.stdout.decode("utf-8", "replace"), p.stderr.decode("utf-8", "replace")
    except subprocess.TimeoutExpired as e:
        return None, (e.stdout or b"").decode("utf-8", "replace"), f"timed out after {timeout} s"
    finally:
        if stdin_path:
            stdin.close()


def base_env(spec):
    env = dict(os.environ)
    env.update({"LC_ALL": "C.UTF-8", "LANG": "C.UTF-8"})
    # A setting may point at test data, such as a folder to serve: {fixture:www}.
    env.update({k: sub_fixtures(v, spec.get("fixtures_dir", "/work/fixtures")) for k, v in (spec.get("env") or {}).items()})
    return env


def exit_ok(code, want):
    """An expected exit code; -1 means any failure (non-zero), for pages that only say the program fails."""
    return code is not None and (code != 0 if want == -1 else code == want)


def numbers(text):
    """Whole numbers and decimals, with a sign, but not digits inside names such as BFS1985.txt."""
    return [float(n) for n in re.findall(r"(?<![\w.])-?(?:\d+(?:\.\d+)?|\.\d+)(?![\w.])", text)]


def same_numbers(got, want):
    return len(got) == len(want) and all(abs(a - b) <= 1e-9 * max(1.0, abs(b)) for a, b in zip(got, want))


def contains_in_order(out, want):
    """Every non-empty expected line appears in the output, in this order (other lines may sit between them)."""
    lines = [l.rstrip() for l in out.splitlines()]
    at = 0
    for line in [l.rstrip() for l in want.splitlines() if l.strip()]:
        while at < len(lines) and lines[at] != line:
            at += 1
        if at == len(lines):
            return False
        at += 1
    return True


def count_lines(text):
    return len([l for l in text.splitlines() if l.strip()])


def check_cli(spec, check, fixtures_dir):
    env = base_env(spec)
    cases = []
    for k in check["cases"]:
        args = " ".join(shlex.quote(sub_fixtures(a, fixtures_dir)) for a in k["args"])
        stdin_path = os.path.join(fixtures_dir, k["stdin"]) if k.get("stdin") else None
        code, out, err = run(f"{spec['run']} {args}", spec["cwd"], env, stdin_path)
        # Paths under the test folder read as relative, as if run from inside it (the way the pages show output).
        out, err = out.replace(fixtures_dir + "/", ""), err.replace(fixtures_dir + "/", "")
        case = {"name": k["name"], "command": f"<run> {args}".replace(fixtures_dir + "/", ""), "exit": code, "stdout": tail(out, 400), "stderr": tail(err, 400)}
        if code is None:
            case.update(passed=False, detail=err)
        elif k.get("reference"):
            ref = " ".join(shlex.quote(sub_fixtures(a, fixtures_dir)) for a in k["reference"])
            rcode, rout, rerr = run(ref, spec["cwd"], env, stdin_path)
            rout = rout.replace(fixtures_dir + "/", "")
            case["expected"] = tail(rout, 400)
            if k["compare"] == "numbers":
                ok = same_numbers(numbers(out), numbers(rout)) and numbers(rout) != []
            elif k["compare"] == "count":
                ok = count_lines(out) == count_lines(rout)
            elif k["compare"] == "contains":
                ok = contains_in_order(out, rout)
            elif k["compare"] == "lines":
                ok = [l.rstrip() for l in out.strip().splitlines()] == [l.rstrip() for l in rout.strip().splitlines()]
            elif k["compare"] == "exit":
                ok = code == rcode
            else:
                ok = out == rout
            if k.get("expect_exit") is not None:
                ok = ok and exit_ok(code, k["expect_exit"])
            case.update(passed=ok, detail="matches the reference" if ok else f"differs from the reference ({k['compare']})")
        else:
            ok = True
            if k.get("expect_stdout") is not None and k["compare"] != "exit":
                want = k["expect_stdout"]
                if k["compare"] == "numbers":
                    ok = same_numbers(numbers(out), numbers(want))
                elif k["compare"] == "count":
                    ok = [count_lines(out)] == [int(n) for n in numbers(want)][:1]
                elif k["compare"] == "contains":
                    ok = contains_in_order(out, want)
                elif k["compare"] == "lines":
                    ok = [l.rstrip() for l in out.strip().splitlines()] == [l.rstrip() for l in want.strip().splitlines()]
                else:
                    ok = out.strip() == want.strip()
                case["expected"] = k["expect_stdout"]
            if k.get("expect_exit") is not None:
                ok = ok and exit_ok(code, k["expect_exit"])
                case["expected_exit"] = k["expect_exit"]
            case.update(passed=ok, detail="as expected" if ok else "not as expected")
        cases.append(case)
    return cases


def check_case_files(spec, check, fixtures_dir):
    env = base_env(spec)
    folder = os.path.join(fixtures_dir, check["dir"])
    if not os.path.isdir(folder):
        return [{"name": check["dir"], "passed": False, "detail": f"test folder {check['dir']} not found in the fixtures"}]
    cases = []
    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        if not os.path.isfile(path):
            continue
        if name.startswith(check["valid_prefix"]):
            want = check["valid_exit"]
        elif name.startswith(check["invalid_prefix"]):
            want = check["invalid_exit"]
        else:
            continue
        code, out, err = run(f"{spec['run']} {shlex.quote(path)}", spec["cwd"], env)
        ok = code == want
        cases.append({"name": f"{check['dir']}/{name}", "exit": code, "expected_exit": want, "passed": ok,
                      "stdout": tail(out, 300), "stderr": tail(err, 300),
                      "detail": "right exit code" if ok else (err if code is None else f"exit {code}, expected {want}")})
    if spec.get("allowed_mismatches"):
        for c in cases:
            if not c["passed"] and os.path.basename(c["name"]) in spec["allowed_mismatches"]:
                c["passed"] = True
                c["detail"] += " (allowed: the current specification differs from this suite)"
    return cases


def anywhere(run_cmd, repo):
    """The run command made to work from any folder: words naming files in the repo (main.py, target/classes) become
    absolute paths, so a check can cd into its own folder and still start the learner's program."""
    def fix(word):
        # Only words that look like paths, so a script name such as `npm run build` never becomes one.
        looks = lambda p: p and ("/" in p or "." in p) and not os.path.isabs(p) and not p.startswith("-")
        return ":".join(os.path.join(repo, p) if looks(p) and os.path.exists(os.path.join(repo, p)) else p for p in word.split(":"))
    try:
        return " ".join(shlex.quote(fix(w)) for w in shlex.split(run_cmd))
    except ValueError:
        return run_cmd


def check_script(spec, check, fixtures_dir):
    """Property checks: a few commands, started in the repo folder. <run> is the learner's program, {tmp} a fresh folder."""
    env = base_env(spec)
    env.setdefault("PORT", str(free_port()))  # for a step that starts a server, such as a development server
    tmp = tempfile.mkdtemp(prefix="step-", dir="/work")
    program = anywhere(spec["run"], spec["cwd"])
    cases = []
    for k in check["commands"]:
        cmd = sub_fixtures(k["run"], fixtures_dir).replace("<run>", program).replace("{tmp}", tmp)
        stdin_path = os.path.join(fixtures_dir, k["stdin"]) if k.get("stdin") else None
        code, out, err = run(cmd, spec["cwd"], env, stdin_path, timeout=60)
        out, err = out.replace(fixtures_dir + "/", ""), err.replace(fixtures_dir + "/", "")
        problems = []
        if code is None:
            problems.append(err)
        elif k.get("expect_exit") is not None and not exit_ok(code, k["expect_exit"]):
            problems.append(f"exit {code}, expected {'non-zero' if k['expect_exit'] == -1 else k['expect_exit']}")
        problems += [f"output doesn't contain {t!r}" for t in k.get("stdout_contains") or [] if t not in out]
        problems += [f"output contains {t!r}" for t in k.get("stdout_not_contains") or [] if t in out]
        shown = k["run"].replace(fixtures_dir + "/", "")
        cases.append({"name": k["name"], "command": shown, "exit": code, "stdout": tail(out, 400), "stderr": tail(err, 400),
                      "passed": not problems, "detail": "; ".join(problems) or "as expected"})
    return cases


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_server(spec, env, log_path, args="", udp=False):
    """Starts the learner's server and waits until it listens on PORT. A UDP server can't be probed, so it only has to stay up."""
    log = open(log_path, "ab")
    proc = subprocess.Popen(["bash", "-c", f"exec {spec['run']} {args}".rstrip()], cwd=spec["cwd"], env=env, stdout=log, stderr=log, start_new_session=True)
    if udp:
        time.sleep(3)
        return proc, proc.poll() is None
    deadline = time.time() + 90
    while time.time() < deadline:
        if proc.poll() is not None:
            return proc, False
        try:
            with socket.create_connection(("127.0.0.1", int(env["PORT"])), timeout=1):
                return proc, True
        except OSError:
            time.sleep(0.5)
    return proc, False


def server_setup(spec, check, fixtures_dir):
    """The environment and start arguments for a server check: the contract's settings, this step's own, a free PORT."""
    env = base_env(spec)
    env.update({e["name"]: e["value"] for e in check.get("env") or []})
    env["PORT"] = str(free_port())
    args = " ".join(shlex.quote(sub_fixtures(a, fixtures_dir)) for a in check.get("start_args") or [])
    return env, args


def stop_server(proc):
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, 15)
            proc.wait(timeout=10)
        except Exception:  # noqa: BLE001
            os.killpg(proc.pid, 9)


def json_field(body, field):
    value = body
    for part in field.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def check_http(spec, check, fixtures_dir, log_path):
    env, args = server_setup(spec, check, fixtures_dir)
    port = int(env["PORT"])
    base = f"http://localhost:{port}"
    env.setdefault("BASE_URL", base)
    proc, up = start_server(spec, env, log_path, args)
    cases = []
    if not up:
        stop_server(proc)
        return [{"name": "start", "passed": False, "detail": f"the service didn't listen on PORT {port} within 90 s"}]
    if check.get("restart_before"):
        stop_server(proc)
        proc, up = start_server(spec, env, log_path, args)
    # Slow clients: each sends half a request and goes quiet while the real requests run.
    idle = []
    for _ in range(check.get("idle_clients") or 0):
        try:
            c = socket.create_connection(("127.0.0.1", port), timeout=5)
            c.sendall(b"GET / HTTP/1.1\r\nHost: localhost\r\n")
            idle.append(c)
        except OSError:
            break
    saved = {"base_url": base}
    opener = urllib.request.build_opener(NoRedirect)
    try:
        for r in check["requests"]:
            time.sleep((r.get("wait_ms") or 0) / 1000)
            fill = lambda s: re.sub(r"\{([a-z_]+)\}", lambda m: str(saved.get(m.group(1), m.group(0))), s)
            url = base + fill(r["path"])
            data = fill(r["json_body"]).encode() if r.get("json_body") else None
            req = urllib.request.Request(url, data=data, method=r["method"], headers={"Content-Type": "application/json"} if data else {})
            try:
                resp = opener.open(req, timeout=20)
                status, headers, raw = resp.status, resp.headers, resp.read()
            except urllib.error.HTTPError as e:
                status, headers, raw = e.code, e.headers, e.read()
            except Exception as e:  # noqa: BLE001
                cases.append({"name": r["name"], "request": f"{r['method']} {fill(r['path'])}", "passed": False, "detail": f"no response: {e}"})
                continue
            text = raw.decode("utf-8", "replace")
            try:
                body = json.loads(text) if text.strip() else None
            except ValueError:
                body = None
            problems = []
            if status not in r["expect_status"]:
                problems.append(f"status {status}, expected {' or '.join(map(str, r['expect_status']))}")
            for h in r.get("expect_headers") or []:
                got = headers.get(h["name"]) or ""
                if fill(h["contains"]) not in got:
                    problems.append(f"header {h['name']} is {got!r}, expected it to contain {fill(h['contains'])!r}")
            for f in r.get("expect_json_fields") or []:
                if json_field(body, f) is None:
                    problems.append(f"JSON field {f} missing")
            for e in r.get("expect_json_equals") or []:
                got = json_field(body, e["field"])
                if str(got) != fill(e["value"]):
                    problems.append(f"{e['field']} is {got!r}, expected {fill(e['value'])!r}")
            if r.get("expect_body_contains") and r["expect_body_contains"] not in text:
                problems.append(f"body doesn't mention {r['expect_body_contains']!r}")
            for s in r.get("save") or []:
                v = json_field(body, s["from_json_field"])
                if v is not None:
                    saved[s["var"]] = v
            cases.append({"name": r["name"], "request": f"{r['method']} {fill(r['path'])}" + (f" {fill(r['json_body'])}" if r.get("json_body") else ""),
                          "status": status, "body": tail(text, 300), "passed": not problems, "detail": "; ".join(problems) or "as expected"})
    finally:
        for c in idle:
            c.close()
        stop_server(proc)
    return cases


# ---------- socket servers and clients ----------

def show(data, n=160):
    text = json.dumps(data.decode("utf-8", "replace"))[1:-1]
    return text if len(text) <= n else text[:n] + "..."


def recv_reply(sock, want, compare, timeout=5):
    """Reads until the expected reply is complete, the peer closes, or nothing more comes. A complete reply waits a
    moment longer, so extra bytes after it show up as a mismatch."""
    sock.settimeout(0.2)
    buf = b""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if (compare == "exact" and len(buf) >= len(want)) or (compare == "contains" and want in buf):
            # Short, so the wait never eats into a lifetime the conversation is timing.
            sock.settimeout(0.05)
            try:
                buf += sock.recv(65536)
            except socket.timeout:
                pass
            break
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            continue
        if not chunk:
            break
        buf += chunk
    return buf


def converse(v, port):
    """One conversation. With several clients all connect first and the last one talks first, so a server that serves
    one connection at a time never answers it."""
    udp = v["transport"] == "udp"
    socks, lines = [], []

    def result(passed, detail):
        return {"name": v["name"], "transcript": tail("\n".join(lines), 800), "passed": passed, "detail": detail}

    n = max(1, int(v.get("clients") or 1))
    try:
        # Several UDP clients are separate sockets, so each sender has its own address to be answered at.
        if udp:
            socks = [socket.socket(socket.AF_INET, socket.SOCK_DGRAM) for _ in range(n)]
        else:
            socks = [socket.create_connection(("127.0.0.1", port), timeout=5) for _ in range(n)]
        for i in reversed(range(len(socks))):
            s, who = socks[i], (f"client {i + 1}: " if len(socks) > 1 else "")
            for m in v["messages"]:
                time.sleep((m.get("wait_ms") or 0) / 1000)
                data, want = m["send"].encode(), m["expect"].encode()
                if udp:
                    s.sendto(data, ("127.0.0.1", port))
                elif m.get("split") and len(data) > 1:
                    s.sendall(data[: len(data) // 2])
                    time.sleep(0.3)
                    s.sendall(data[len(data) // 2:])
                else:
                    s.sendall(data)
                if not want:
                    lines.append(f"{who}sent {show(data)}")
                    continue
                if udp:
                    s.settimeout(5)
                    try:
                        got = s.recvfrom(65536)[0]
                    except socket.timeout:
                        got = b""
                else:
                    got = recv_reply(s, want, m["compare"])
                lines.append(f"{who}sent {show(data)} got {show(got) if got else 'nothing'}")
                if (got != want) if m["compare"] == "exact" else (want not in got):
                    waiting = " while other clients were connected" if len(socks) > 1 and not got else ""
                    expected = show(want) if m["compare"] == "exact" else f"a reply containing {show(want)}"
                    return result(False, f"{who}sent {show(data)}, expected {expected}, got {show(got) if got else 'nothing'}{waiting}")
    except OSError as e:
        return result(False, f"connection failed: {e}")
    finally:
        for s in socks:
            s.close()
    return result(True, "as expected")


def check_socket(spec, check, fixtures_dir, log_path):
    env, args = server_setup(spec, check, fixtures_dir)
    port = int(env["PORT"])
    udp = all(v["transport"] == "udp" for v in check["conversations"])
    proc, up = start_server(spec, env, log_path, args, udp)
    if not up:
        stop_server(proc)
        return [{"name": "start", "passed": False, "detail": "the server didn't stay up" if udp else f"the server didn't listen on PORT {port} within 90 s"}]
    cases = []
    try:
        for v in check["conversations"]:
            if v.get("restart_before"):
                stop_server(proc)
                proc, up = start_server(spec, env, log_path, args, udp)
                if not up:
                    cases.append({"name": v["name"], "passed": False, "detail": "the server didn't start again after a restart"})
                    continue
            cases.append(converse(v, port))
    finally:
        stop_server(proc)
    return cases


class Stub:
    """A stand-in server for client checks: records every request and answers them with the check's replies in order,
    repeating the last, so one stub can play several servers (a root, then a top-level domain, then the answer)."""

    def __init__(self, transport, replies, reply_hex):
        self.udp, self.replies, self.reply_hex = transport == "udp", replies, reply_hex
        self.received, self.done = [], False
        self.lock = threading.Lock()
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM if self.udp else socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind(("127.0.0.1", 0))
        self.port = self.sock.getsockname()[1]
        if not self.udp:
            self.sock.listen(8)
        self.sock.settimeout(0.2)
        threading.Thread(target=self.serve, daemon=True).start()

    def answer(self, request):
        """The reply bytes for the request just recorded. In hex, {req:A:B} copies bytes A to B of the request (a DNS
        answer repeats the query's ID)."""
        with self.lock:
            self.received.append(request)
            reply = self.replies[min(len(self.received), len(self.replies)) - 1]
        if not self.reply_hex:
            return reply.encode()
        out = b""
        for m in re.finditer(r"\{req:(\d+):(\d*)\}|([0-9a-fA-F\s]+)", reply):
            if m.group(3) is not None:
                out += bytes.fromhex(re.sub(r"\s", "", m.group(3)))
            else:
                out += request[int(m.group(1)): int(m.group(2)) if m.group(2) else None]
        return out

    def serve(self):
        while not self.done:
            try:
                if self.udp:
                    data, addr = self.sock.recvfrom(65536)
                    self.sock.sendto(self.answer(data), addr)
                else:
                    conn, _ = self.sock.accept()
                    threading.Thread(target=self.handle, args=(conn,), daemon=True).start()
            except socket.timeout:
                continue
            except OSError:
                break

    def handle(self, conn):
        # A request is complete once the client stops sending for a moment or closes its side.
        conn.settimeout(0.3)
        data, deadline = b"", time.time() + 5
        while time.time() < deadline:
            try:
                chunk = conn.recv(65536)
            except socket.timeout:
                if data:
                    break
                continue
            except OSError:
                break
            if not chunk:
                break
            data += chunk
        try:
            conn.sendall(self.answer(data))
        except OSError:
            pass
        conn.close()

    def close(self):
        self.done = True
        self.sock.close()


def check_client(spec, check, fixtures_dir):
    """Runs the learner's client against a stub server, then checks what it sent and what it printed."""
    env = base_env(spec)
    cases = []
    for k in check["commands"]:
        stub = Stub(k["transport"], k.get("replies") or [k.get("reply", "")], k.get("reply_hex"))
        cmd = (sub_fixtures(k["run"], fixtures_dir).replace("<run>", spec["run"]).replace("{stub}", f"127.0.0.1:{stub.port}")
               .replace("{stub_host}", "127.0.0.1").replace("{stub_port}", str(stub.port)))
        try:
            code, out, err = run(cmd, spec["cwd"], env, None, timeout=30)
        finally:
            time.sleep(0.1)
            stub.close()
        sent = b"".join(stub.received)
        problems = []
        if code is None:
            problems.append(err)
        elif k.get("expect_exit") is not None and not exit_ok(code, k["expect_exit"]):
            problems.append(f"exit {code}, expected {'non-zero' if k['expect_exit'] == -1 else k['expect_exit']}")
        problems += [f"output doesn't contain {t!r}" for t in k.get("stdout_contains") or [] if t not in out]
        problems += [f"neither output nor errors contain {t!r}" for t in k.get("output_contains") or [] if t not in out + err]
        texts, hexes = k.get("received_contains") or [], k.get("received_hex_contains") or []
        if (texts or hexes) and not sent:
            problems.append("the program never sent anything to the server")
        elif texts or hexes:
            problems += [f"the request doesn't contain {t!r}" for t in texts if t.encode() not in sent]
            problems += [f"the request doesn't contain the bytes {h}" for h in hexes if bytes.fromhex(re.sub(r"\s", "", h)) not in sent]
        cases.append({"name": k["name"], "command": k["run"], "exit": code, "sent": show(sent, 400), "stdout": tail(out, 400), "stderr": tail(err, 400),
                      "passed": not problems, "detail": "; ".join(problems) or "as expected"})
    return cases


def check_setup(spec, log_path):
    """Step 0 for every project: the program starts. A CLI runs without a launcher error; a server listens on PORT."""
    env = base_env(spec)
    if spec["runner"] in ("http", "socket"):
        env["PORT"] = str(free_port())
        env.setdefault("BASE_URL", f"http://localhost:{env['PORT']}")
        proc, up = start_server(spec, env, log_path)
        stop_server(proc)
        return [{"name": "starts and listens on PORT", "passed": up, "detail": "listening" if up else "didn't listen within 90 s"}]
    code, out, err = run(spec["run"], spec["cwd"], env, None, timeout=20)
    # Still running after 20 s (waiting on the network, say) also means it started.
    ok = (code is None or code < 126) and not LAUNCH_ERRORS.search(err + out)
    return [{"name": "the program starts", "exit": code, "stdout": tail(out, 300), "stderr": tail(err, 600), "passed": ok,
             "detail": "started" if ok else "the run command didn't start the program"}]


def check(spec_path):
    spec = json.load(open(spec_path, encoding="utf-8"))
    fixtures_dir = spec.get("fixtures_dir", "/work/fixtures")
    log_path = "/work/server.log"
    try:
        prepare_fixtures(spec.get("fixtures") or [], fixtures_dir)
    except Exception as e:  # noqa: BLE001
        emit({"ok": False, "error": f"preparing test files failed: {e}", "cases": []})
        return
    try:
        if spec["step"] == "s0" or spec.get("check") is None:
            cases = check_setup(spec, log_path)
        elif spec["runner"] == "cli":
            cases = check_cli(spec, spec["check"], fixtures_dir)
        elif spec["runner"] == "case-files":
            cases = check_case_files(spec, spec["check"], fixtures_dir)
        elif spec["runner"] == "script":
            cases = check_script(spec, spec["check"], fixtures_dir)
        elif spec["runner"] == "http":
            cases = check_http(spec, spec["check"], fixtures_dir, log_path)
        elif spec["runner"] == "socket":
            cases = check_socket(spec, spec["check"], fixtures_dir, log_path)
        elif spec["runner"] == "client":
            cases = check_client(spec, spec["check"], fixtures_dir)
        else:
            cases = []
    except Exception as e:  # noqa: BLE001
        emit({"ok": False, "error": f"the check itself failed: {e}", "cases": []})
        return
    log = open(log_path, encoding="utf-8", errors="replace").read() if os.path.exists(log_path) else ""
    emit({"ok": bool(cases) and all(c["passed"] for c in cases), "cases": cases, "server_log": tail(log, 1500)})


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "detect":
        emit(detect(sys.argv[2]))
    elif len(sys.argv) == 3 and sys.argv[1] == "check":
        check(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(2)
