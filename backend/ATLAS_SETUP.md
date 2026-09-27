# Watts Happening：Atlas 数据导入与共享

当前应用通过后端环境变量连接 Atlas，数据库为 `utility_projects_db`，当前团队集合为 `utility_projects`（1,315 条）和 `overlapping_projects`（799 条）。连接和集合名称分别由 `MONGODB_URI`、`MONGODB_DATABASE`、`MONGODB_PROJECTS_COLLECTION` 和 `MONGODB_OVERLAPS_COLLECTION` 配置。
初次 CSV 导入使用过 `projects` 和 `overlaps` 两个集合，原始 CSV 文件未修改。下面的导入脚本仍使用这两个原始集合名；它不负责同步当前团队集合，也不需要在部署应用时运行。

初次导入工具会创建查询索引：`projects(company_name, project_id)`、`overlaps(utility_a, project_id_a)` 和 `overlaps(utility_b, project_id_b)`，以及各集合自动提供的 `_id` 唯一索引。

- 在 [Atlas 控制台](https://cloud.mongodb.com/) 中选择团队项目及集群，通过 Data Explorer 查看数据。
- 队友邀请在项目的 Identity & Access 中进行，由项目负责人选择 `Project Data Access Read/Write` 权限。

前端通过 `/api/dashboard` 获取当前配置的云端数据，公司名称归一化和配对筛选在后端统一执行。启动步骤见 [backend/README.md](README.md)。本地 `.env` 被 Git 忽略；线上部署使用托管平台的环境变量设置。

## 让 Atlas 插件可以导入

Organization Owner 在 Atlas 中打开 **Organization Settings → App Connections**，允许 AI 客户端访问，选择 **Read and write** 并保存。
组织设置与授权用户的角色共同限制插件权限；需要允许写入的用户角色。

官方说明：<https://www.mongodb.com/docs/mcp-server/remote-mcp/manage-ai-client-access/>

## 本地检查

从仓库根目录运行（不连接 Atlas，不需要凭据）：

```powershell
python backend/import_csv.py
```

当前文件应校验得到 `projects: 1315`、`overlaps: 799`。
需要供插件使用的 JSON 时，可通过 `--export-json <directory>` 导出。

数据约定：

- `projects` 每行是一个变电站记录，同一项目可以出现多行；`_id` 为 `substation:<substation_id>`，保留全部 26 行未分配项目的记录。
- `overlaps` 的 `_id` 使用 `overlap_id`。所有业务 ID 保留字符串形式。
- 经纬度、距离转为数字；`time_gap (day)` 转为整数，缺失值为 `null`。
- `cost`、`length_mi`、`estimated_in_service_year` 保留 CSV 原始字符串，因为它们可能包含范围、说明或多个年份。其他字段的空字符串、`NaN` 原样保留。
- 去除公司名称、关联项目 ID 两端的空白，保持两个集合的关联一致。
- 使用行级 ID，重跑同一份文件不会增加重复记录；遇到与云端现有记录不一致时停止，保留队友修改。这个工具用于初次导入和中断后重试，不用于持续同步数据。

## 手动使用 Python 导入

此方式由有数据库访问权限的操作者使用。通过 Codex 插件操作时，组织仍须允许相应的 AI 访问权限。

安装驱动：

```powershell
python -m pip install pymongo
```

在目标集群的 **Connect → Drivers** 中获取连接字符串，再设置到当前进程的 `MONGODB_URI` 环境变量。使用自己的 Database User，并将 `MONGODB_DATABASE` 设为待导入的数据库。该脚本只适用于首次导入或重试原始 `projects` 和 `overlaps` 集合。
不要把密码写入 Git、命令历史或发给整个团队；每位队友使用自己的数据库账号。
可用 PowerShell 隐藏输入：

```powershell
$atlasSecret = Read-Host 'Paste your MongoDB URI' -AsSecureString
$env:MONGODB_URI = [System.Net.NetworkCredential]::new('', $atlasSecret).Password
$env:MONGODB_DATABASE = 'utility_projects_db'
python backend/import_csv.py --apply
Remove-Item Env:MONGODB_URI
Remove-Item Env:MONGODB_DATABASE
```

导入前同时检查两个集合；仅插入缺失行，不删除或覆盖文档。结束后逐条读回核对内容和数量，并建立项目关联索引。
导入不是跨两个集合的原子事务，网络中断后可能只完成部分记录；解决网络问题后可重跑同一文件。
若目标集合已存在另一套记录，请先检查，或用 `--database <new_database_name>` 选择独立数据库。

## 队友共享（允许查询和修改）

**在 Atlas 网页中共同查看/修改：** 项目中打开 **Project Identity & Access → Users → Invite to Project**，输入队友的 Atlas 登录邮箱，角色选择 **Project Data Access Read/Write**。队友接受邀请后进入 Data Explorer 查看两个集合。这是项目范围的权限。

**从 Python、后端或 Compass 访问：** 每位队友创建独立 Database User，仅授予 `utility_projects_db` 的 `readWrite` 权限，并将其电脑/应用出口 IP 添加到项目 IP Access List。Atlas 网页账号和 Database User 是两套不同权限。

共享数据库不会自动同步本地 CSV；后续程序需要连接 Atlas，才能读到云端修改。

官方参考：

- 项目成员：<https://www.mongodb.com/docs/atlas/access/manage-project-access/>
- 角色：<https://www.mongodb.com/docs/atlas/reference/user-roles/>
- 数据库账号：<https://www.mongodb.com/docs/atlas/security-add-mongodb-users/>
- 连接与网络要求：<https://www.mongodb.com/docs/atlas/connect-to-database-deployment/>
