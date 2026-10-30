"""ThinkAloud's harness inside the sandbox. Standard library only, so it runs on the plain sandbox image.

  python3 runner.py detect REPO_DIR    proposes build and run commands for the learner to confirm
  python3 runner.py check SPEC_JSON    prepares fixtures, runs one step's check, prints the results

Results are printed as one line starting with RESULT_MARK, so build noise around it doesn't matter.
The check kinds (cli, case-files, http) match app/lib/gen/schema.ts.
"""
import glob
import json
import os
import re
import shlex
import socket
import subprocess
import sys
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
    env.update(spec.get("env") or {})
    return env


def numbers(text):
    return [int(n) for n in re.findall(r"(?<![\w.])\d+(?![\w.])", text)]


def check_cli(spec, check, fixtures_dir):
    env = base_env(spec)
    cases = []
    for k in check["cases"]:
        args = " ".join(shlex.quote(sub_fixtures(a, fixtures_dir)) for a in k["args"])
        stdin_path = os.path.join(fixtures_dir, k["stdin"]) if k.get("stdin") else None
        code, out, err = run(f"{spec['run']} {args}", spec["cwd"], env, stdin_path)
        case = {"name": k["name"], "command": f"<run> {args}".replace(fixtures_dir + "/", ""), "exit": code, "stdout": tail(out, 400), "stderr": tail(err, 400)}
        if code is None:
            case.update(passed=False, detail=err)
        elif k.get("reference"):
            ref = " ".join(shlex.quote(sub_fixtures(a, fixtures_dir)) for a in k["reference"])
            rcode, rout, rerr = run(ref, spec["cwd"], env, stdin_path)
            case["expected"] = tail(rout, 400)
            if k["compare"] == "numbers":
                ok = numbers(out) == numbers(rout) and numbers(rout) != []
            elif k["compare"] == "lines":
                ok = [l.rstrip() for l in out.strip().splitlines()] == [l.rstrip() for l in rout.strip().splitlines()]
            elif k["compare"] == "exit":
                ok = code == rcode
            else:
                ok = out == rout
            if k.get("expect_exit") is not None:
                ok = ok and code == k["expect_exit"]
            case.update(passed=ok, detail="matches the reference" if ok else f"differs from the reference ({k['compare']})")
        else:
            ok = True
            if k.get("expect_stdout") is not None:
                ok = (numbers(out) == numbers(k["expect_stdout"])) if k["compare"] == "numbers" else out.strip() == k["expect_stdout"].strip()
                case["expected"] = k["expect_stdout"]
            if k.get("expect_exit") is not None:
                ok = ok and code == k["expect_exit"]
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


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_server(spec, env, log_path):
    log = open(log_path, "ab")
    proc = subprocess.Popen(["bash", "-c", f"exec {spec['run']}"], cwd=spec["cwd"], env=env, stdout=log, stderr=log, start_new_session=True)
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


def check_http(spec, check, log_path):
    env = base_env(spec)
    port = free_port()
    env["PORT"] = str(port)
    base = f"http://localhost:{port}"
    env.setdefault("BASE_URL", base)
    proc, up = start_server(spec, env, log_path)
    cases = []
    if not up:
        stop_server(proc)
        return [{"name": "start", "passed": False, "detail": f"the service didn't listen on PORT {port} within 90 s"}]
    if check.get("restart_before"):
        stop_server(proc)
        proc, up = start_server(spec, env, log_path)
    saved = {"base_url": base}
    opener = urllib.request.build_opener(NoRedirect)
    try:
        for r in check["requests"]:
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
        stop_server(proc)
    return cases


def check_setup(spec, log_path):
    """Step 0 for every project: the program starts. A CLI runs without a launcher error; a server listens on PORT."""
    env = base_env(spec)
    if spec["runner"] == "http":
        env["PORT"] = str(free_port())
        env.setdefault("BASE_URL", f"http://localhost:{env['PORT']}")
        proc, up = start_server(spec, env, log_path)
        stop_server(proc)
        return [{"name": "starts and listens on PORT", "passed": up, "detail": "listening" if up else "didn't listen within 90 s"}]
    code, out, err = run(spec["run"], spec["cwd"], env, None, timeout=20)
    ok = code is not None and code < 126 and not LAUNCH_ERRORS.search(err + out)
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
        elif spec["runner"] == "http":
            cases = check_http(spec, spec["check"], log_path)
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
