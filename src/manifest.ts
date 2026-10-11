import { defineFrontModule } from "@neton/application-front-contract";

export default defineFrontModule({
  id: "account",
  contractVersion: "1.0.0",
  locales: [
    { lang: "zh-CN", entry: "zh-CN" },
    { lang: "en-US", entry: "en-US" },
  ],
  pages: [
    { key: "account/user/index", path: "/account/user", entry: "user-list", rendering: "client" },
    { key: "account/user/detail", path: "/account/user/:id", entry: "user-detail", rendering: "client", standalone: true, identity: ["id"], title: "账号详情 · :id" },
  ],
});
