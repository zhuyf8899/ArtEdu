"""Build the reviewed November web catalogue, with private media outside the frontend."""
import argparse
import hashlib
import json
import posixpath
import re
import uuid
import zipfile
from collections import defaultdict
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

ROOT = "课程/网页/原子课程与知识网络_v0.1/"
MIME = {".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
        ".mp4": "video/mp4", ".md": "text/markdown", ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".zip": "application/zip"}
PILOT = {"submitted-054", "submitted-055"}
def js_data(z, name):
    return json.JSONDecoder().raw_decode(z.read(name).decode("utf-8-sig").split("=", 1)[1].lstrip())[0]
def digest(data):
    return hashlib.sha256(data).hexdigest()
def stable(key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "morph-november/" + key))
def asset_path(base, src):
    return posixpath.normpath(posixpath.join(base, urlsplit(src).path))

class Catalogue:
    def __init__(self, archive, out):
        self.z, self.out = archive, out
        (out / "media").mkdir(parents=True, exist_ok=True)
        self.art = {}
    def media(self, key, data, name, mime):
        sha = digest(data)
        target = self.out / "media" / sha
        if not target.exists():
            target.write_bytes(data)
        return dict(id=stable(key), sha256=sha, size=len(data), name=name, mime=mime)
    def illustration(self, base, src):
        if not src:
            return None
        name = asset_path(base, src)
        data = self.z.read(name)
        ext = PurePosixPath(name).suffix.lower()
        if ext not in {".svg", ".png", ".webp", ".jpg"}:
            raise ValueError(name)
        if ext == ".svg" and re.search(rb'<script|foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["\'](?:https?:|javascript:|//)', data, re.I):
            raise ValueError("Unexpected external or executable SVG: " + name)
        key = digest(data)[:24] + ext
        dest = self.out / "illustrations"
        dest.mkdir(exist_ok=True)
        (dest / key).write_bytes(data)
        self.art[key] = digest(data)
        return "/morph-november/catalog/" + key
    def atom(self, row, detail):
        source = row.get("sourceCourse", "")
        desc = row.get("description") or (detail or {}).get("summary") or ""
        title = row["title"]
        parts = []
        outline = row.get("detailOutline", {})
        goals = outline.get("goals") or (detail or {}).get("goals") or []
        def section(s):
            parts.extend([s.get("title",""), s.get("summary","")])
            parts.extend(v for v in s.get("points",[]) if isinstance(v,str))
            for child in s.get("children",[]):
                section(child)
        if outline.get("intro"):
            parts.append(outline["intro"])
        for s in outline.get("sections",[]):
            section(s)
        if detail and detail.get("description"):
            parts.append(detail["description"])
        for heading, body in row.get("details", []):
            if heading not in ("节点贡献者","节点展示素材（有则填写）") and body != desc:
                parts.append("### " + heading + ("\n" + body if body else ""))
        status = row.get("detailStatus", "")
        outline_only = "待补充" in status or status == "已提供节点名称"
        summary = desc or row.get("sourceCourseIntro") or (f"《{source}》课程大纲中的“{title}”。" if source else f"“{title}”教学节点，详细内容待补充。")
        pieces = [s.strip() for s in [desc, *parts] if s.strip()]
        if not pieces:
            pieces = [summary]
        if outline_only:
            pieces.insert(0, "> " + status)
        materials = list(row.get("attachments", []))
        figure = outline.get("figure")
        if figure:
            materials.append({"url":figure["src"],"title":figure.get("caption") or title})
        attachments = []
        for m in materials:
            name = asset_path(ROOT,m["url"])
            ext = PurePosixPath(name).suffix
            attachments.append(self.media(row["id"]+"/"+name,self.z.read(name),m["title"]+ext,MIME[ext]))
        return {"id":"morph-nov-"+row["id"],"key":row["id"],"teacher":row.get("teacher") or "MORPH LAB 课程资料库",
                "course":source,"usedIn":row.get("usedIn",[]),"cover":self.illustration(ROOT,row["cover"]),
                "outline":outline_only,"assets":attachments,"payload":{"title":title,"summary":summary,
                "objective":("；".join(goals) if goals else desc or "阅读本节点的课程大纲，了解教学范围。"),
                "content":"\n\n".join(pieces),"minutes":max(1,min(60,round(sum(map(len,pieces))/220))),
                "direction":row["category"],"knowledge":[title],"tools":[],"completion":"read","exercise":"",
                "assetIds":[a["id"] for a in attachments],"source":" · ".join(filter(None,[source,row["teacher"],row.get("teacherTitle"),status,"用时为建议阅读时间"]))}}
    def work(self, row):
        key = row["id"]
        assets, blocks, plates, known = [], [], [], {}
        def add(src, title, kind, preview="", data=None):
            if src in known:
                return known[src]
            name = asset_path("平台",src)
            ext = PurePosixPath(name).suffix.lower()
            if data is None:
                if not name.startswith("案例/网页素材/"+key+"/"):
                    raise ValueError(name)
                data = self.z.read(name)
            asset = self.media(key+"/"+src,data,title+ext,MIME[ext])
            asset.update(type=kind,title=title,preview=preview)
            assets.append(asset)
            known[src] = asset["id"]
            return asset["id"]
        for i, a in enumerate(row["artifacts"]):
            title = a["title"]
            if a["kind"] != "document":
                add(a["src"],title,a["kind"])
                continue
            preview = a.get("text") or "\n\n".join(s["title"]+"\n"+s.get("text","") for s in a.get("slides",[]))
            pictures = list(a.get("pages",[]))
            for slide in a.get("slides",[]):
                pictures.extend(slide.get("images",[]))
            if a.get("download"):
                add(a["download"],title,"document",preview)
            elif preview:
                add(f"reading-{i}.md",title,"document",preview,preview.encode())
            if pictures:
                plates.append({"title":title, "assetIds":[add(pic["src"],pic["title"],"image") for pic in pictures]})
        for b in row.get("story", []):
            if b.get("text","").strip():
                blocks.append({"text":b["text"].strip()})
            elif b.get("src"):
                blocks.append({"assetId":add(b["src"],b["title"],"image")})
        if row["cover"] not in known:
            raise ValueError("Missing cover " + key)
        return dict(key=key,title=row["title"],summary=row["desc"],category=row["type"],tags=row["tags"],
                    creators=[x["name"] for x in row["contributors"] if not x.get("isDemo")] or [row["author"]],
                    tools=row["toolIds"],related=row["relatedCourses"],assets=assets,blocks=blocks,plates=plates,cover=known[row["cover"]])
    def build(self):
        data=js_data(self.z,"平台/platform-data.js")
        rows=js_data(self.z,ROOT+"courses.js")
        source=json.loads(self.z.read("案例/网页数据/real-cases.json"))
        meta={t["id"]:t for t in json.loads(self.z.read("工具/官方资料来源.json"))}
        for name, records, count in [("courses",rows,124),("cases",source,50),("tools",data["tools"],40)]:
            ids={r["id"] for r in records}
            if len(ids)!=count or ids!={r["id"] for r in data[name]}:
                raise ValueError("Unexpected "+name+" directory")
        nodes=[]
        for row in rows:
            for entry in [row,*row.get("children",[])]:
                detail=None
                href=urlsplit(entry.get("href",""))
                if href.fragment and href.path.endswith("index.html"):
                    path=asset_path(ROOT,href.path).replace("index.html","course-data.js")
                    if path in self.z.namelist():
                        detail=next((d for d in js_data(self.z,path)["nodes"] if d["id"]==href.fragment and d.get("contentStatus")!="simulated"),None)
                nodes.append(self.atom(entry,detail))
        if len({n["key"] for n in nodes})!=len(nodes):
            raise ValueError("Duplicate node identity")
        works=[self.work(r) for r in source if r["id"]!="case-08"]
        tools=[]
        for t in data["tools"]:
            tools.append(dict(key=t["id"],name=t["title"],href=t["officialUrl"],category=t["type"],detail=t["desc"],
                              cover=self.illustration("平台",t.get("badgeIcon")),tags=t["tags"],stage=t.get("stage",""),
                              subtitle=t.get("subtitle",""),courseTitles=meta.get(t["id"],{}).get("courseTitles",[])))
        return dict(id="morph-november-20261119-catalog-v1",nodes=nodes,works=works,tools=tools,
                    illustrationHashes=self.art)

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip",type=Path)
    parser.add_argument("out",type=Path)
    args=parser.parse_args()
    with zipfile.ZipFile(args.zip) as archive:
        catalog=Catalogue(archive,args.out).build()
    raw=json.dumps(catalog,ensure_ascii=False,separators=(",",":")).encode()
    (args.out/"catalog.json").write_bytes(raw)
    print("Catalogue SHA-256",digest(raw),"nodes",len(catalog["nodes"]),"additional cases",len(catalog["works"]))
