#!/usr/bin/env python3
# Build a "Companion" KAWA template = Meeting Advisor graph + an `assistant`
# agent node (fed by transcript + screen + user-chat) that answers the user
# using live context. Prints the new template id.
import json, sys, urllib.request

BASE = "http://localhost:3100/api/live"

def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.load(r)

def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.load(r)

# 1. find the Meeting Advisor template graph
tpls = get("/templates?q=Meeting%20Advisor").get("templates", [])
ma = next((t for t in tpls if t.get("name") == "Meeting Advisor"), None)
if not ma:
    print("Meeting Advisor template not found", file=sys.stderr); sys.exit(1)
graph = ma["graph"]

# 2. add an assistant agent node (no display tools → replies in plain text)
assistant = {
    "id": "assistant",
    "kind": "agent",
    "label": "Companion Assistant",
    "position": {"x": 400.0, "y": 560.0},
    "config": {
        "kind": "agent",
        "model": "auto",
        "streaming": True,
        "prompt": ("You are the user's always-on companion. Use the live meeting transcript "
                   "and any screen context to answer the user's chat messages directly, concisely, "
                   "and helpfully. If they ask a question, answer it plainly. Do not call any tools; "
                   "respond in plain text.")
    },
    "defaultView": {"latestOnly": True, "showAgent": True, "showInput": False, "showTools": False}
}
# avoid duplicate if re-run
graph["nodes"] = [n for n in graph["nodes"] if n["id"] != "assistant"] + [assistant]

def edge(eid, frm, cfg):
    return {"id": eid, "from": frm, "to": "assistant", "config": cfg}

new_edges = [
    edge("a-user", "user-chat", {"activation": "always", "batchIntervalMs": 500}),
    edge("a-tx", "transcript", {"activation": "always", "batchIntervalMs": 4000, "filter": "final-only", "throttleMs": 3000}),
    edge("a-scr", "screen-share", {"activation": "always", "batchIntervalMs": 8000}),
]
graph["edges"] = [e for e in graph["edges"] if e.get("to") != "assistant"] + new_edges
graph["name"] = "Companion"
graph["id"] = "companion"

# 3. register the new template
res = post("/templates", {"name": "Companion",
                          "description": "Meeting Advisor + always-on assistant agent",
                          "graph": graph})
print(res.get("id") or res.get("templateId") or json.dumps(res)[:200])
