"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useMutation, usePermission, useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import { formatDateTime, type PageResponse } from "@neton/application-front-runtime/types";
import {
  Button,
  DataTable,
  Drawer,
  Field,
  FilterPanel,
  Input,
  PageHeader,
  Pagination,
  RowActions,
  Select,
  StatusBadge,
  type DataColumn,
} from "@neton/application-front-kit";

interface MemberUser {
  id: number;
  identityProvider?: string | null;
  username?: string | null;
  mobile?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  status?: number | null;
  levelId?: number | null;
  levelName?: string | null;
  experience?: number | null;
  point?: number | null;
  groupId?: number | null;
  groupName?: string | null;
  registerIp?: string | null;
  loginIp?: string | null;
  loginRegion?: string | null;
  loginDate?: number | null;
  createdAt?: string | null;
}

interface SimpleOption { id: number; name?: string | null; }
interface MemberEditState {
  id: number;
  mobile: string;
  nickname: string;
  avatar: string;
  status: number;
  levelId: string;
  groupId: string;
}

const GEO_LITE_DOWNLOAD_URL = "https://git.io/GeoLite2-City.mmdb";

function LoginRegion({ value }: { value: string }) {
  if (value !== "GeoLite2 库未设置") return <>{value}</>;
  return (
    <>
      <a className="underline underline-offset-2 hover:text-[var(--foreground)]" href={GEO_LITE_DOWNLOAD_URL} target="_blank" rel="noreferrer">GeoLite2</a>
      {" 库未设置"}
    </>
  );
}

export default function MemberUserListPage() {
  const queryClient = useQueryClient();
  const canUpdate = usePermission("member:user:update");
  const canResetPassword = usePermission("member:user:update-password");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [draft, setDraft] = React.useState({ uid: "", username: "", nickname: "", mobile: "", status: "", includeRobot: false });
  const [filters, setFilters] = React.useState(draft);
  const [selected, setSelected] = React.useState<MemberUser | null>(null);
  const [editing, setEditing] = React.useState<MemberEditState | null>(null);
  const [passwordUser, setPasswordUser] = React.useState<MemberUser | null>(null);
  const [password, setPassword] = React.useState("");
  const [passwordAgain, setPasswordAgain] = React.useState("");
  const [pointUser, setPointUser] = React.useState<MemberUser | null>(null);
  const [pointDelta, setPointDelta] = React.useState(0);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const params = new URLSearchParams({ pageNo: String(page), pageSize: String(pageSize), includeRobot: String(filters.includeRobot) });
  // 只带上非空条件：服务端把空串当「没填」，发过去只会白跑一次 LIKE '%%'。
  if (filters.uid) params.set("uid", filters.uid);
  if (filters.username) params.set("username", filters.username);
  if (filters.nickname) params.set("nickname", filters.nickname);
  if (filters.mobile) params.set("mobile", filters.mobile);
  if (filters.status) params.set("status", filters.status);

  const query = useQuery({
    queryKey: ["member", "users", page, pageSize, filters],
    queryFn: () => apiFetch<PageResponse<MemberUser>>(`/admin/member/user/page?${params}`),
  });
  const levels = useQuery({ queryKey: ["member", "levels", "simple"], queryFn: () => apiFetch<SimpleOption[]>("/admin/member/level/list-all-simple") });
  const groups = useQuery({ queryKey: ["member", "groups", "simple"], queryFn: () => apiFetch<SimpleOption[]>("/admin/member/group/list-all-simple") });

  const saveMutation = useMutation({
    mutationFn: (value: MemberEditState) => apiWrite<void>("/admin/member/user/update", "PUT", {
      id: value.id,
      mobile: value.mobile.trim() ? value.mobile.trim().replace(/^\+86/, "") : null,
      nickname: value.nickname.trim(),
      avatar: value.avatar.trim() || null,
      status: value.status,
      levelId: value.levelId ? Number(value.levelId) : null,
      groupId: value.groupId ? Number(value.groupId) : null,
    }),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["member", "users"] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  /**
   * 管理员重设会员登录密码：不需要旧密码，两次输入一致 + 至少 8 位（与注册链路同一条规则）。
   *
   * 明文只用于这一次请求：成功或关窗都把两个输入清空，不让它留在组件状态里等着被
   * 下一次打开抽屉时看见。
   */
  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => apiWrite<void>("/admin/member/user/update-password", "PUT", { id, password }),
    onSuccess: () => { setPasswordUser(null); setPassword(""); setPasswordAgain(""); },
    onError: (error: Error) => setActionError(error.message),
  });

  const pointMutation = useMutation({
    mutationFn: ({ id, point }: { id: number; point: number }) => apiWrite<void>("/admin/member/user/update-point", "PUT", { id, point }),
    onSuccess: async () => {
      setPointUser(null);
      setPointDelta(0);
      await queryClient.invalidateQueries({ queryKey: ["member", "users"] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const columns: DataColumn<MemberUser>[] = [
    { key: "user", header: "会员", cell: (user) => <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">{(user.nickname || String(user.id)).slice(0, 1).toUpperCase()}</span><span><span className="block font-semibold text-[var(--foreground)]">{user.nickname || "未设置昵称"}</span><span className="block text-xs text-[var(--muted-foreground)]">ID {user.id}</span></span></div> },
    { key: "mobile", header: "手机号", cell: (user) => user.mobile || <span className="text-[var(--muted-foreground)]">未绑定</span> },
    { key: "source", header: "身份来源", cell: (user) => <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-xs font-bold text-[var(--muted-foreground)]">{user.identityProvider || "member"}</span> },
    { key: "level", header: "等级 / 分组", cell: (user) => <span><span className="block text-xs font-semibold">{user.levelName || "默认等级"}</span><span className="mt-1 block text-xs text-[var(--muted-foreground)]">{user.groupName || "未分组"}</span></span> },
    { key: "point", header: "积分", cell: (user) => <span className="font-mono text-xs font-semibold">{user.point ?? 0}</span> },
    { key: "status", header: "状态", cell: (user) => <StatusBadge active={user.status !== 0}>{user.status === 0 ? "停用" : "启用"}</StatusBadge> },
    {
      key: "loginIp",
      header: "登录 IP / 地区",
      cell: (user) => user.loginIp ? (
        <span>
          <code className="block text-xs text-[var(--foreground)]">{user.loginIp}</code>
          {user.loginRegion && <span className="mt-1 block text-xs text-[var(--muted-foreground)]"><LoginRegion value={user.loginRegion} /></span>}
        </span>
      ) : <span className="text-xs text-[var(--muted-foreground)]">暂无记录</span>,
    },
    { key: "loginDate", header: "最近登录", cell: (user) => <span className="text-xs text-[var(--muted-foreground)]">{formatDateTime(user.loginDate)}</span> },
    {
      key: "actions",
      header: "操作",
      headerClassName: "text-right",
      className: "text-right",
      cell: (user) => <RowActions primary={[{ label: "详情", onClick: () => setSelected(user) }, ...(canUpdate ? [{ label: "编辑", onClick: () => { setActionError(null); setEditing({ id: user.id, mobile: user.mobile ?? "", nickname: user.nickname ?? "", avatar: user.avatar ?? "", status: user.status ?? 1, levelId: user.levelId ? String(user.levelId) : "", groupId: user.groupId ? String(user.groupId) : "" }); } }] : [])]} more={[...(canUpdate ? [{ label: "调整积分", onClick: () => { setActionError(null); setPointDelta(0); setPointUser(user); } }] : []), ...(canResetPassword ? [{ label: "重设密码", onClick: () => { setActionError(null); setPassword(""); setPasswordAgain(""); setPasswordUser(user); } }] : [])]} />,
    },
  ];

  function submitFilters(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({ uid: draft.uid.trim(), username: draft.username.trim(), nickname: draft.nickname.trim(), mobile: draft.mobile.trim(), status: draft.status, includeRobot: draft.includeRobot });
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="MEMBER DIRECTORY" title="会员列表" description="管理产品会员资料、状态、等级分组与积分。IM 用户身份由 PrivChat 模块独立维护。" actions={<><span className="rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--primary)]">{query.data?.total ?? 0} MEMBERS</span><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>刷新</Button></>} />
      <FilterPanel onSubmit={submitFilters}>
        <div className="admin-filter-grid admin-filter-grid-member">
          <Field label="用户编号"><Input value={draft.uid} onChange={(event) => setDraft({ ...draft, uid: event.target.value.replace(/\D/g, "") })} placeholder="完整编号" inputMode="numeric" /></Field>
          <Field label="用户名"><Input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} placeholder="输入用户名" /></Field>
          <Field label="会员昵称"><Input value={draft.nickname} onChange={(event) => setDraft({ ...draft, nickname: event.target.value })} placeholder="输入昵称" /></Field>
          <Field label="手机号"><Input value={draft.mobile} onChange={(event) => setDraft({ ...draft, mobile: event.target.value })} placeholder="输入手机号" /></Field>
          <Field label="状态"><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">全部状态</option><option value="1">启用</option><option value="0">停用</option></Select></Field>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--muted-foreground)]"><input type="checkbox" checked={draft.includeRobot} onChange={(event) => setDraft({ ...draft, includeRobot: event.target.checked })} />包含机器人</label>
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => { const next = { uid: "", username: "", nickname: "", mobile: "", status: "", includeRobot: false }; setDraft(next); setFilters(next); setPage(1); }}>重置</Button><Button type="submit">查询</Button></div>
        </div>
      </FilterPanel>
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_34px_rgba(30,52,44,0.05)]">
        <DataTable columns={columns} rows={query.data?.list ?? []} rowKey={(user) => user.id} loading={query.isPending} error={query.error?.message} minWidth={1160} />
        <Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} loading={query.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />
      </section>

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="会员详情">
        {selected && <div className="space-y-4">
          <div className="rounded-2xl bg-[var(--hero)] p-5 text-white"><div className="text-xl font-bold">{selected.nickname || "未设置昵称"}</div><div className="mt-1 text-xs text-white/45">Member #{selected.id}</div><div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs"><span className="text-white/45">当前积分</span><span className="font-bold text-[var(--primary)]">{selected.point ?? 0}</span></div></div>
          <dl className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">{[
            ["用户名", selected.username || "未设置"], ["手机号", selected.mobile || "未绑定"], ["身份来源", selected.identityProvider || "member"], ["等级", selected.levelName || "默认等级"], ["分组", selected.groupName || "未分组"], ["经验值", String(selected.experience ?? 0)], ["注册 IP", selected.registerIp || "-"], ["登录 IP", selected.loginIp || "-"], ["登录地区", selected.loginRegion || "-"], ["最近登录", formatDateTime(selected.loginDate)], ["注册时间", formatDateTime(selected.createdAt)],
          ].map(([label, value]) => <div key={label} className="grid grid-cols-[100px_1fr] gap-4 border-b border-[var(--muted)] px-4 py-3.5 last:border-0"><dt className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</dt><dd className="break-all text-right text-xs font-semibold text-[var(--foreground)]">{value}</dd></div>)}</dl>
        </div>}
      </Drawer>

      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title="编辑会员" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>取消</Button><Button type="submit" form="member-edit-form" disabled={saveMutation.isPending}>{saveMutation.isPending ? "保存中…" : "保存会员"}</Button></>}>
        {editing && <form id="member-edit-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!editing.nickname.trim()) return setActionError("会员昵称不能为空"); setActionError(null); saveMutation.mutate(editing); }}>
          {actionError && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}
          <Field label="会员昵称"><Input value={editing.nickname} onChange={(event) => setEditing({ ...editing, nickname: event.target.value })} /></Field>
          <Field label="手机号"><Input value={editing.mobile} onChange={(event) => setEditing({ ...editing, mobile: event.target.value })} placeholder="中国大陆手机号" /></Field>
          <Field label="头像 URL"><Input value={editing.avatar} onChange={(event) => setEditing({ ...editing, avatar: event.target.value })} /></Field>
          <Field label="状态"><Select value={editing.status} onChange={(event) => setEditing({ ...editing, status: Number(event.target.value) })}><option value="1">启用</option><option value="0">停用</option></Select></Field>
          <Field label="会员等级"><Select value={editing.levelId} onChange={(event) => setEditing({ ...editing, levelId: event.target.value })}><option value="">默认等级</option>{(levels.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></Field>
          <Field label="会员分组"><Select value={editing.groupId} onChange={(event) => setEditing({ ...editing, groupId: event.target.value })}><option value="">未分组</option>{(groups.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></Field>
        </form>}
      </Drawer>

      <Drawer open={Boolean(passwordUser)} onClose={() => { setPasswordUser(null); setPassword(""); setPasswordAgain(""); }} title="重设密码" description={passwordUser ? `会员 ${passwordUser.nickname || passwordUser.id}（管理员改密不需要旧密码）` : undefined} footer={<><Button variant="ghost" onClick={() => { setPasswordUser(null); setPassword(""); setPasswordAgain(""); }}>取消</Button><Button disabled={passwordMutation.isPending || password.length < 8 || password !== passwordAgain} onClick={() => passwordUser && passwordMutation.mutate({ id: passwordUser.id, password })}>{passwordMutation.isPending ? "提交中…" : "确认重设"}</Button></>}>
        <div className="space-y-4">
          <Field label="新密码"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" /></Field>
          <Field label="确认新密码"><Input type="password" autoComplete="new-password" value={passwordAgain} onChange={(e) => setPasswordAgain(e.target.value)} placeholder="再输入一次" /></Field>
          {password.length > 0 && password.length < 8 && <p className="text-xs text-red-600">密码至少 8 位（与注册链路同一条规则）。</p>}
          {passwordAgain.length > 0 && password !== passwordAgain && <p className="text-xs text-red-600">两次输入不一致。</p>}
          <p className="text-[11px] text-[var(--muted-foreground)]">改完请通过安全渠道告知本人；这里不回显、也不保存明文。</p>
        </div>
      </Drawer>
      <Drawer open={Boolean(pointUser)} onClose={() => setPointUser(null)} title="调整积分" description="积分变更会写入会员积分流水。" footer={<><Button variant="ghost" onClick={() => setPointUser(null)}>取消</Button><Button onClick={() => pointUser && pointDelta !== 0 && pointMutation.mutate({ id: pointUser.id, point: pointDelta })} disabled={pointMutation.isPending || pointDelta === 0}>{pointMutation.isPending ? "处理中…" : "确认调整"}</Button></>}>
        {pointUser && <div className="space-y-4">{actionError && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}<div className="rounded-2xl bg-[var(--hero)] p-5 text-white"><div className="text-xs text-white/45">当前积分</div><div className="mt-2 text-2xl font-semibold">{pointUser.point ?? 0}</div><div className="mt-4 text-xs text-[var(--primary)]">调整后 {(pointUser.point ?? 0) + pointDelta}</div></div><Field label="变更值（增加填正数，扣减填负数）"><Input type="number" value={pointDelta} onChange={(event) => setPointDelta(Number(event.target.value))} /></Field></div>}
      </Drawer>
    </div>
  );
}
