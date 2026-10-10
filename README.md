# neton-application-front-account

Neton Application Front 的账号业务模块。页面 key 与服务端 account 模块的 `system_menus.component` 保持一致。

账号页只依赖 account 后端。装了 member 模块且持有 `member:profile:query` / `member:profile:update` 时，
账号列表与详情会额外显示并允许修改等级、分组、积分等会员档案；没有这些权限时相应列与操作自动隐藏。
