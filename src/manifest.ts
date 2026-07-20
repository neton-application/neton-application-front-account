import { defineFrontModule } from "@neton/application-front-contract";

export default defineFrontModule({
  id: "member",
  contractVersion: "1.0.0",
  pages: [
    { key: "member/user/index", path: "/member/user", entry: "user-list", rendering: "client" },
    { key: "member/tag/index", path: "/member/tag", entry: "tag-list", rendering: "client" },
    { key: "member/level/index", path: "/member/level", entry: "level-list", rendering: "client" },
    { key: "member/group/index", path: "/member/group", entry: "group-list", rendering: "client" },
    { key: "member/point/record/index", path: "/member/point/record", entry: "point-record", rendering: "client" },
    { key: "member/signin/config/index", path: "/member/signin/config", entry: "signin-config", rendering: "client" },
    { key: "member/signin/record/index", path: "/member/signin/record", entry: "signin-record", rendering: "client" },
    { key: "member/config/index", path: "/member/config", entry: "member-config", rendering: "client" },
    { key: "member/invite/code/index", path: "/member/invite/code", entry: "invite-code", rendering: "client" },
  ],
});
