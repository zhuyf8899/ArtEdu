"""Prepare the November pilot from the supplied ZIP; originals stay outside the web build."""
import argparse
import hashlib
import json
import re
import uuid
import zipfile
from pathlib import Path, PurePosixPath

COURSE_ROOT = "课程/网页/原子课程与知识网络_v0.1/"
COURSE_ID = "morph-nov-exhibition-design"
WORK_ID = "morph-nov-case-08"
PREFIX = "案例/网页素材/case-08/"
DOCUMENTS = {
    "人口普查口径与阅读说明": "003_Census scope and reading note.md",
    "数据简报与图表清单": "010_Data brief and chart inventory.md",
    "图谱编辑方案": "018_Atlas editorial presentation.pptx",
}
MIME = {".webp": "image/webp", ".mp4": "video/mp4", ".md": "text/markdown",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}


def js_data(archive, name):
    source = archive.read(name).decode("utf-8-sig").split("=", 1)[1].lstrip()
    return json.JSONDecoder().raw_decode(source)[0]


def by_id(rows):
    items = {r["id"]: r for r in rows}
    if len(items) != len(rows):
        raise ValueError("Duplicate source IDs")
    return items


def prepare(archive, output):
    platform = js_data(archive, "平台/platform-data.js")
    atoms = by_id(js_data(archive, COURSE_ROOT + "courses.js"))
    cases = by_id(json.loads(archive.read("案例/网页数据/real-cases.json")))
    tools = by_id(platform["tools"])
    if set(atoms) != set(by_id(platform["courses"])) or set(cases) != set(by_id(platform["cases"])):
        raise ValueError("Directory and detail records disagree")
    if (len(atoms), len(cases), len(tools)) != (124, 50, 40):
        raise ValueError("Unexpected edition of the handoff")
    nodes = []
    for key in ("submitted-054", "submitted-055"):
        row = atoms[key]
        details = dict(row["details"])
        points = re.split(r"(?:^|(?<=。))\s*\d+\.\s*", details["知识要点"])
        points = [p.strip() for p in points if p.strip()]
        content = row["description"] + "\n\n### 知识要点\n" + "\n".join("- " + p for p in points)
        content += "\n\n### 跨课程应用\n" + details["跨课程共享信息（有则填写）"]
        nodes.append({"id": "morph-nov-" + key, "sourceId": key, "kind": "teaching",
                      "payload": {"title": row["title"], "summary": row["description"],
                                  "objective": points[0], "content": content, "direction": row["category"],
                                  "knowledge": [row["title"]], "tools": ["Gemus"] if key == "submitted-054" else ["SVATA"],
                                  "minutes": 5, "completion": "read", "exercise": "", "assetIds": [],
                                  "source": f'{row["sourceCourse"]} · {row["teacher"]} · {row["teacherTitle"]}。5 分钟为平台建议阅读时长。'}})
    course = atoms["submitted-054"]["sourceCourse"]
    if atoms["submitted-055"]["sourceCourse"] != course:
        raise ValueError("Selected nodes no longer belong to the same course")
    steps = [{"atomId": n["id"], "revision": 1, "required": True, "prerequisites": [], "context": "", "task": ""} for n in nodes]
    nodes.append({"id": COURSE_ID, "kind": "course", "payload": {"title": course,
                  "summary": "本课程收录“" + "”与“".join(n["payload"]["title"] for n in nodes) + "”两个教学节点。", "steps": steps}})
    row = cases["case-08"]
    assets = []
    for index, asset in enumerate(row["artifacts"]):
        if asset["kind"] == "document":
            original = "案例/原始资料/08-中国住宅信息设计/" + DOCUMENTS[asset["title"]]
        else:
            original = asset["src"].removeprefix("../")
            if not original.startswith(PREFIX) or ".." in PurePosixPath(original).parts:
                raise ValueError("Unexpected case asset")
        data = archive.read(original)
        sha = hashlib.sha256(data).hexdigest()
        (output / "media" / sha).write_bytes(data)
        ext = PurePosixPath(original).suffix
        assets.append({"id": str(uuid.uuid5(uuid.NAMESPACE_URL, WORK_ID + "/" + original)),
                       "name": asset["title"] + ext, "type": asset["kind"], "mime": MIME[ext],
                       "title": asset["title"], "sha256": sha, "bytes": len(data), "order": index,
                       "preview": asset.get("text") or "\n\n".join(s["title"] + "\n" + s["text"] for s in asset.get("slides", [])),
                       "cover": "../" + original == row["cover"]})
    if sum(a["cover"] for a in assets) != 1:
        raise ValueError("Missing or ambiguous case cover")
    tool = tools["gemus"]
    if tool["id"] not in row["toolIds"]:
        raise ValueError("Case-tool relation changed")
    return {"id": "morph-november-20261119-pilot-v1", "nodes": nodes,
            "teacher": atoms["submitted-054"]["teacher"],
            "work": {"id": WORK_ID, "title": row["title"], "summary": row["desc"], "category": row["type"],
                     "author": row["author"], "tags": row["tags"], "assets": assets},
            "tool": {"id": "morph-tool-gemus", **{k: tool[k] for k in ("title", "subtitle", "desc", "type", "tags", "stage", "officialUrl")}}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    (args.output / "media").mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.archive) as package:
        result = prepare(package, args.output)
    (args.output / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Verified 124 node IDs, 50 case IDs, 40 tool IDs. Prepared 1 course, 2 nodes, 1 case, 1 tool.")
