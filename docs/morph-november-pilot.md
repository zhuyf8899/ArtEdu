# 11 月 19 日交接包首批集成

本批使用《展示设计研究与创新实践》的两个节点、工具 Gemus 以及社区案例《中国居住图谱》。案例的正文阅读材料取自交接页，原件、WebP 和 MP4 进入平台原有的私有文件目录。交接包与媒体存放在前端发布目录之外。

## 准备和预演

在项目根目录运行下列命令。路径示例中的 `/path/to` 和 `/data` 请替换为本机路径。准备程序使用 Python 3.9 或更高版本的标准库。源文件是 11 月 19 日完整 ZIP。

```sh
python scripts/prepare-november-handoff.py "/path/to/MORPH-开发交接-11.19更新.zip" "/data/morph-november-bundle"
npm run db:migrate
cd apps/api
npm run build
node scripts/install-november-handoff.mjs "/data/morph-november-bundle" --plan
```

预演会核对清单、每个附件的 SHA-256、数据库约束与现有内容冲突，然后回滚事务。出现同名或标识冲突时检查对应记录的来源和版本，再决定映射方式。

## 安装

在同一个 `apps/api` 工作目录，使用目标 API 实际的数据库配置与上传目录执行。

```sh
node scripts/install-november-handoff.mjs "/data/morph-november-bundle" --apply
```

安装时写入带版本的内容清单记录。重复运行会为仍在使用的附件补齐缺失文件，并保留后台编辑。课程的两个引用各自固定在原子版本 1；课程进度来自当前用户对该版本的学习记录。

## 核对

- 从技能工具的 Gemus 卡片进入「教学原子」和「应用案例」。
- 从完整课程打开《展示设计研究与创新实践》，进入关联原子并核对进度。
- 打开《中国居住图谱》，查看图集、拖动视频进度条、展开三份文稿。普通学生可阅读交接页提供的文稿，原件沿用平台的下载权限。
- 教师可选择交接包的新方向、发布教学原子，并在课程编排中引用已发布版本。
- 本批使用社区案例分类。原有精选案例和历史课程继续使用各自的记录。

## 全量目录

先安装上面的首批内容，再从项目根目录准备同一份交接包的完整目录，依次运行：

```sh
python scripts/prepare-november-catalog.py "/path/to/MORPH-开发交接-11.19更新.zip" "/data/morph-november-full"
cd apps/api
node scripts/install-november-catalog.mjs "/data/morph-november-full" --plan
node scripts/install-november-catalog.mjs "/data/morph-november-full" --apply
```

全量清单按交接站的最终目录组织。共用原子只保存一份，课程引用具体版本；仅有大纲的条目在目录中标示。案例正文和分组配图写入作品原记录，文稿预览与附件下载分别沿用平台权限。安装时公开插图写入前端的 `public/morph-november/catalog`，完成导入后再构建前端。部署时数据库与 API 上传目录需要配套备份。
