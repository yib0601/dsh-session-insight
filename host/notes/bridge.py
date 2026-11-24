#!/usr/bin/env python3
"""notes bridge — 常驻的笔记检索服务，供 dsh-session-insight 的 Host 半边调用。

为什么需要它
────────────
笔记检索（section 级 BM25 + 语义混合）的实现在 `~/note/.notes/search_core.py`，
语义层要靠 `emb_server.py` 常驻加载 onnx 模型（实测 RSS ~1GB，模型加载 1-2s）。
所以**不能**每次查询起一个新进程：那样每次都要重付模型加载，延迟不可接受
（`emb_server.py` 的文档注释就是这么写的）。

本进程常驻：模型/索引/emb_server 只在首次查询时付一次成本，之后每查询
毫秒~几十毫秒。Node 侧（`provider.js`）拉一次、长期复用。

协议（行分隔 JSON，stdin/stdout）
────────────────────────────────
→ {"id":1,"op":"search","query":"conntrack 连接重置","limit":5,
   "tags":["网络"],"dir":"系统","exp_only":true,"no_context":false}
← {"id":1,"ok":true,"mode":"hybrid","semantic":"ready","relevance":"in",
   "results":[{"path":"网络/FRP.md","line":1,"anchor":"FRP 内网穿透",
               "isExperience":false,"context":"1: ...","score":0.031}]}

→ {"id":2,"op":"ping"}   ← {"id":2,"ok":true,"pid":123,"repo":"/home/yibin/note"}
→ {"op":"quit"}          ← {"ok":true}

模型只在第一次 search 时加载。bridge 自身不缓存查询结果——检索结果的
新鲜度由 search_core 的 10 秒 mtime 窗口负责（常驻期间改笔记同样生效）。

用法：python3 bridge.py --repo /home/yibin/note
      （必须用 .notes/venv 的解释器，否则语义层不可用、只剩词面）
"""
import json
import os
import sys
import traceback
from pathlib import Path


def _fail(msg):
    sys.stdout.write(json.dumps({"ok": False, "error": str(msg)}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _load_core(repo):
    """把 <repo>/.notes 加进 sys.path 后导入内核。

    `.notes/` 不在检索索引里、也不是安装包，只能靠路径注入。导入失败通常是
    解释器用错（缺 fastembed）——那种情况仍要能起来，退化成纯词面。
    """
    notes_dir = Path(repo) / ".notes"
    if not notes_dir.is_dir():
        raise RuntimeError(f"not a notes repo (no .notes/): {repo}")
    if str(notes_dir) not in sys.path:
        sys.path.insert(0, str(notes_dir))
    import search_core  # noqa: E402
    return search_core


def main():
    repo = None
    argv = sys.argv[1:]
    for i, a in enumerate(argv):
        if a == "--repo" and i + 1 < len(argv):
            repo = argv[i + 1]
    repo = repo or os.environ.get("NOTES_REPO") or str(Path.home() / "note")
    # 展开波浪号并绝对化：调用方（Node 侧）理应已展开，但这一层不能假设它做对了 ——
    # 传进来 `~/note` 时 `Path('~/note')` 不是家目录，会直接判成"不是笔记仓库"并退出 1，
    # 而 Node 侧只看到 exit code（错误详情在 stdout 的 _fail 里，容易被吞）。
    repo = str(Path(repo).expanduser().resolve())

    try:
        core = _load_core(repo)
    except Exception as err:  # noqa: BLE001 - 启动失败要如实回报，不能静默
        _fail(f"bridge init failed: {err}")
        return 1

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as err:
            _fail(f"bad json: {err}")
            continue

        op = req.get("op") or "search"
        rid = req.get("id")

        if op == "quit":
            sys.stdout.write(json.dumps({"ok": True}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            return 0

        if op == "ping":
            sys.stdout.write(json.dumps(
                {"id": rid, "ok": True, "pid": os.getpid(), "repo": repo}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            continue

        try:
            results = core.search(
                repo,
                req.get("query") or "",
                tags=req.get("tags") or None,
                dir_filter=req.get("dir") or None,
                limit=int(req.get("limit") or 8),
                with_context=not req.get("no_context", False),
                show_experiences_only=bool(req.get("exp_only", False)),
            )
            status = core.LAST_SEARCH_STATUS or {}
            payload = {
                "id": rid,
                "ok": True,
                "mode": status.get("mode"),
                "semantic": status.get("semantic"),
                "relevance": status.get("relevance"),
                "error": status.get("error"),
                "results": [
                    {
                        "path": r.get("path"),
                        "title": r.get("title"),
                        "line": r.get("line"),
                        "endLine": r.get("end_line"),
                        "anchor": r.get("anchor"),
                        "headingPath": r.get("heading_path"),
                        "dir": r.get("dir"),
                        "isExperience": bool(r.get("is_experience")),
                        "score": r.get("score"),
                        "sources": r.get("sources") or [],
                        "tags": r.get("tags") or [],
                        "context": r.get("context") or "",
                    }
                    for r in (results or [])
                ],
            }
        except Exception as err:  # noqa: BLE001 - 单次查询失败不能让常驻进程死掉
            payload = {"id": rid, "ok": False, "error": f"{err}"}
            traceback.print_exc(file=sys.stderr)

        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
