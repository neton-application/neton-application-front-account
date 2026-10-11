"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useMutation, usePermission, useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import { formatDateTime, type PageResponse } from "@neton/application-front-runtime/types";
import { useT } from "@neton/application-front-runtime/i18n";
import { useDescribeError } from "@neton/application-front-runtime/errors";
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

/** 账号行。等级 / 分组 / 积分不属于账号，装了 member 模块时从会员档案合并进来。 */
interface AccountUser {
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
interface MemberProfile { userId: number; levelId?: number | null; levelName?: string | null; experience?: number | null; point?: number | null; groupId?: number | null; groupName?: string | null; }
interface AccountEditState {
  id: number;
  mobile: string;
  nickname: string;
  avatar: string;
  status: number;
  levelId: string;
  groupId: string;
}

const GEO_LITE_DOWNLOAD_URL = "https://git.io/GeoLite2-City.mmdb";

/** 后端在没配 GeoLite2 库时回填到 loginRegion 的固定哨兵值（「GeoLite2 库未设置」），只用于比对，不直接显示。 */
const GEO_LITE_MISSING_SENTINEL = "GeoLite2 \u5e93\u672a\u8bbe\u7f6e";

function LoginRegion({ value }: { value: string }) {
  const t = useT("account");
  if (value !== GEO_LITE_MISSING_SENTINEL) return <>{value}</>;
  // 模板里用 {link} 标出链接位置，各语言自己决定语序。
  const [before, after = ""] = t("user.region.geoLiteMissing").split("{link}");
  return (
    <>
      {before}
      <a className="underline underline-offset-2 hover:text-[var(--foreground)]" href={GEO_LITE_DOWNLOAD_URL} target="_blank" rel="noreferrer">GeoLite2</a>
      {after}
    </>
  );
}

export default function AccountUserListPage() {
  const t = useT("account");
  const describeError = useDescribeError();
  const queryClient = useQueryClient();
  const canUpdate = usePermission("account:user:update");
  const canResetPassword = usePermission("account:user:update-password");
  // 会员档案（等级、分组、积分）归 member 模块。没装 member 时这两个权限点不存在，
  // 相关列和操作自然隐藏 —— 账号页不依赖会员模块也能完整工作。
  const canProfile = usePermission("member:profile:query");
  const canProfileUpdate = usePermission("member:profile:update");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [draft, setDraft] = React.useState({ uid: "", username: "", nickname: "", mobile: "", status: "", includeRobot: false, includeGuest: false });
  const [filters, setFilters] = React.useState(draft);
  const [selected, setSelected] = React.useState<AccountUser | null>(null);
  const [editing, setEditing] = React.useState<AccountEditState | null>(null);
  const [passwordUser, setPasswordUser] = React.useState<AccountUser | null>(null);
  const [password, setPassword] = React.useState("");
  const [passwordAgain, setPasswordAgain] = React.useState("");
  const [pointUser, setPointUser] = React.useState<AccountUser | null>(null);
  const [pointDelta, setPointDelta] = React.useState(0);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const params = new URLSearchParams({ pageNo: String(page), pageSize: String(pageSize), includeRobot: String(filters.includeRobot), includeGuest: String(filters.includeGuest) });
  // 只带上非空条件：服务端把空串当「没填」，发过去只会白跑一次 LIKE '%%'。
  if (filters.uid) params.set("uid", filters.uid);
  if (filters.username) params.set("username", filters.username);
  if (filters.nickname) params.set("nickname", filters.nickname);
  if (filters.mobile) params.set("mobile", filters.mobile);
  if (filters.status) params.set("status", filters.status);

  const query = useQuery({
    queryKey: ["account", "users", page, pageSize, filters],
    queryFn: () => apiFetch<PageResponse<AccountUser>>(`/admin/account/user/page?${params}`),
  });
  const levels = useQuery({ queryKey: ["member", "levels", "simple"], queryFn: () => apiFetch<SimpleOption[]>("/admin/member/level/list-all-simple"), enabled: canProfileUpdate });
  const groups = useQuery({ queryKey: ["member", "groups", "simple"], queryFn: () => apiFetch<SimpleOption[]>("/admin/member/group/list-all-simple"), enabled: canProfileUpdate });

  // 本页账号的会员档案一次批量取回，不做 N+1。
  const pageIds = (query.data?.list ?? []).map((user) => user.id);
  const profiles = useQuery({
    queryKey: ["member", "profiles", pageIds],
    queryFn: () => apiFetch<MemberProfile[]>(`/admin/member/user/profiles?ids=${pageIds.join(",")}`),
    enabled: canProfile && pageIds.length > 0,
  });
  const profileById = React.useMemo(() => new Map((profiles.data ?? []).map((p) => [p.userId, p])), [profiles.data]);
  const rows: AccountUser[] = React.useMemo(
    () => (query.data?.list ?? []).map((user) => ({ ...user, ...(profileById.get(user.id) ? { levelId: profileById.get(user.id)!.levelId, levelName: profileById.get(user.id)!.levelName, groupId: profileById.get(user.id)!.groupId, groupName: profileById.get(user.id)!.groupName, point: profileById.get(user.id)!.point, experience: profileById.get(user.id)!.experience } : {}) })),
    [query.data, profileById],
  );

  const saveMutation = useMutation({
    mutationFn: async (value: AccountEditState) => {
      await apiWrite<void>("/admin/account/user/update", "PUT", {
        id: value.id,
        mobile: value.mobile.trim() ? value.mobile.trim().replace(/^\+86/, "") : null,
        nickname: value.nickname.trim(),
        avatar: value.avatar.trim() || null,
        status: value.status,
      });
      // 等级 / 分组属于会员档案，只在确实改了时才写，并且只在有权限时才出现在表单里。
      if (canProfileUpdate) {
        const before = profileById.get(value.id);
        const levelId = value.levelId ? Number(value.levelId) : null;
        const groupId = value.groupId ? Number(value.groupId) : null;
        if (levelId !== null && levelId !== (before?.levelId ?? null)) {
          await apiWrite<void>("/admin/member/user/update-level", "PUT", { id: value.id, levelId });
        }
        if (groupId !== (before?.groupId ?? null)) {
          await apiWrite<void>("/admin/member/user/update-group", "PUT", { id: value.id, groupId });
        }
      }
    },
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["account", "users"] });
      await queryClient.invalidateQueries({ queryKey: ["member", "profiles"] });
    },
    onError: (error: Error) => setActionError(describeError(error)),
  });

  /**
   * 管理员重设会员登录密码：不需要旧密码，两次输入一致 + 至少 8 位（与注册链路同一条规则）。
   *
   * 明文只用于这一次请求：成功或关窗都把两个输入清空，不让它留在组件状态里等着被
   * 下一次打开抽屉时看见。
   */
  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => apiWrite<void>("/admin/account/user/update-password", "PUT", { id, password }),
    onSuccess: () => { setPasswordUser(null); setPassword(""); setPasswordAgain(""); },
    onError: (error: Error) => setActionError(describeError(error)),
  });

  const pointMutation = useMutation({
    mutationFn: ({ id, point }: { id: number; point: number }) => apiWrite<void>("/admin/member/user/update-point", "PUT", { id, point }),
    onSuccess: async () => {
      setPointUser(null);
      setPointDelta(0);
      await queryClient.invalidateQueries({ queryKey: ["member", "profiles"] });
    },
    onError: (error: Error) => setActionError(describeError(error)),
  });

  const columns: DataColumn<AccountUser>[] = [
    { key: "user", header: t("user.field.account"), cell: (user) => <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">{(user.nickname || String(user.id)).slice(0, 1).toUpperCase()}</span><span><span className="block font-semibold text-[var(--foreground)]">{user.nickname || t("user.noNickname")}</span><span className="block text-xs text-[var(--muted-foreground)]">ID {user.id}</span></span></div> },
    { key: "mobile", header: t("user.field.mobile"), cell: (user) => user.mobile || <span className="text-[var(--muted-foreground)]">{t("user.unbound")}</span> },
    { key: "source", header: t("user.field.identitySource"), cell: (user) => <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-xs font-bold text-[var(--muted-foreground)]">{user.identityProvider || "builtin"}</span> },
    ...(canProfile ? [
      { key: "level", header: t("user.field.levelGroup"), cell: (user: AccountUser) => <span><span className="block text-xs font-semibold">{user.levelName || t("user.defaultLevel")}</span><span className="mt-1 block text-xs text-[var(--muted-foreground)]">{user.groupName || t("user.ungrouped")}</span></span> },
      { key: "point", header: t("user.field.point"), cell: (user: AccountUser) => <span className="font-mono text-xs font-semibold">{user.point ?? 0}</span> },
    ] satisfies DataColumn<AccountUser>[] : []),
    { key: "status", header: t("user.field.status"), cell: (user) => <StatusBadge active={user.status !== 0}>{user.status === 0 ? t("user.status.disabled") : t("user.status.enabled")}</StatusBadge> },
    {
      key: "loginIp",
      header: t("user.field.loginIpRegion"),
      cell: (user) => user.loginIp ? (
        <span>
          <code className="block text-xs text-[var(--foreground)]">{user.loginIp}</code>
          {user.loginRegion && <span className="mt-1 block text-xs text-[var(--muted-foreground)]"><LoginRegion value={user.loginRegion} /></span>}
        </span>
      ) : <span className="text-xs text-[var(--muted-foreground)]">{t("list.noLoginRecord")}</span>,
    },
    { key: "loginDate", header: t("user.field.lastLogin"), cell: (user) => <span className="text-xs text-[var(--muted-foreground)]">{formatDateTime(user.loginDate)}</span> },
    {
      key: "actions",
      header: t("list.field.actions"),
      headerClassName: "text-right",
      className: "text-right",
      cell: (user) => <RowActions primary={[{ label: t("list.action.detail"), kind: "view" as const, href: `/account/user/${user.id}` }, ...(canUpdate ? [{ label: t("list.action.edit"), kind: "edit" as const, onClick: () => { setActionError(null); setEditing({ id: user.id, mobile: user.mobile ?? "", nickname: user.nickname ?? "", avatar: user.avatar ?? "", status: user.status ?? 1, levelId: user.levelId ? String(user.levelId) : "", groupId: user.groupId ? String(user.groupId) : "" }); } }] : [])]} more={[{ label: t("list.action.quickView"), kind: "view" as const, onClick: () => setSelected(user) }, ...(canProfileUpdate ? [{ label: t("user.action.adjustPoint"), onClick: () => { setActionError(null); setPointDelta(0); setPointUser(user); } }] : []), ...(canResetPassword ? [{ label: t("user.action.resetPassword"), kind: "key" as const, onClick: () => { setActionError(null); setPassword(""); setPasswordAgain(""); setPasswordUser(user); } }] : [])]} />,
    },
  ];

  function submitFilters(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft, uid: draft.uid.trim(), username: draft.username.trim(), nickname: draft.nickname.trim(), mobile: draft.mobile.trim() });
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t("list.eyebrow")} title={t("list.title")} description={t("list.description")} actions={<><span className="rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--primary)]">{t("list.totalBadge", { count: query.data?.total ?? 0 })}</span><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>{t("list.refresh")}</Button></>} />
      <FilterPanel onSubmit={submitFilters}>
        <div className="admin-filter-grid admin-filter-grid-member">
          <Field label={t("list.filter.uid")}><Input value={draft.uid} onChange={(event) => setDraft({ ...draft, uid: event.target.value.replace(/\D/g, "") })} placeholder={t("list.filter.uidPlaceholder")} inputMode="numeric" /></Field>
          <Field label={t("user.field.username")}><Input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} placeholder={t("list.filter.usernamePlaceholder")} /></Field>
          <Field label={t("user.field.nickname")}><Input value={draft.nickname} onChange={(event) => setDraft({ ...draft, nickname: event.target.value })} placeholder={t("list.filter.nicknamePlaceholder")} /></Field>
          <Field label={t("user.field.mobile")}><Input value={draft.mobile} onChange={(event) => setDraft({ ...draft, mobile: event.target.value })} placeholder={t("list.filter.mobilePlaceholder")} /></Field>
          <Field label={t("user.field.status")}><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">{t("list.filter.allStatus")}</option><option value="1">{t("user.status.enabled")}</option><option value="0">{t("user.status.disabled")}</option></Select></Field>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--muted-foreground)]"><input type="checkbox" checked={draft.includeRobot} onChange={(event) => setDraft({ ...draft, includeRobot: event.target.checked })} />{t("list.filter.includeRobot")}</label>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--muted-foreground)]"><input type="checkbox" checked={draft.includeGuest} onChange={(event) => setDraft({ ...draft, includeGuest: event.target.checked })} />{t("list.filter.includeGuest")}</label>
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => { const next = { uid: "", username: "", nickname: "", mobile: "", status: "", includeRobot: false, includeGuest: false }; setDraft(next); setFilters(next); setPage(1); }}>{t("list.filter.reset")}</Button><Button type="submit">{t("list.filter.search")}</Button></div>
        </div>
      </FilterPanel>
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_34px_rgba(30,52,44,0.05)]">
        <DataTable columns={columns} rows={rows} rowKey={(user) => user.id} loading={query.isPending} error={query.error ? describeError(query.error) : null} minWidth={1160} />
        <Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} loading={query.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />
      </section>

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={t("list.quickView.title")}>
        {selected && <div className="space-y-4">
          <div className="rounded-2xl bg-[var(--hero)] p-5 text-white"><div className="text-xl font-bold">{selected.nickname || t("user.noNickname")}</div><div className="mt-1 text-xs text-white/45">{t("user.accountNo", { id: selected.id })}</div>{canProfile && <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs"><span className="text-white/45">{t("user.point.current")}</span><span className="font-bold text-[var(--primary)]">{selected.point ?? 0}</span></div>}</div>
          <dl className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">{[
            [t("user.field.username"), selected.username || t("user.notSet")], [t("user.field.mobile"), selected.mobile || t("user.unbound")], [t("user.field.identitySource"), selected.identityProvider || "builtin"], ...(canProfile ? [[t("user.field.level"), selected.levelName || t("user.defaultLevel")], [t("user.field.group"), selected.groupName || t("user.ungrouped")], [t("list.field.experience"), String(selected.experience ?? 0)]] : []), [t("user.field.registerIp"), selected.registerIp || "-"], [t("user.field.loginIp"), selected.loginIp || "-"], [t("user.field.loginRegion"), selected.loginRegion || "-"], [t("user.field.lastLogin"), formatDateTime(selected.loginDate)], [t("user.field.createdAt"), formatDateTime(selected.createdAt)],
          ].map(([label, value]) => <div key={label} className="grid grid-cols-[100px_1fr] gap-4 border-b border-[var(--muted)] px-4 py-3.5 last:border-0"><dt className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</dt><dd className="break-all text-right text-xs font-semibold text-[var(--foreground)]">{value}</dd></div>)}</dl>
        </div>}
      </Drawer>

      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title={t("user.edit.title")} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>{t("user.cancel")}</Button><Button type="submit" form="account-edit-form" disabled={saveMutation.isPending}>{saveMutation.isPending ? t("user.edit.saving") : t("user.edit.save")}</Button></>}>
        {editing && <form id="account-edit-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!editing.nickname.trim()) return setActionError(t("user.edit.nicknameRequired")); setActionError(null); saveMutation.mutate(editing); }}>
          {actionError && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}
          <Field label={t("user.field.nickname")}><Input value={editing.nickname} onChange={(event) => setEditing({ ...editing, nickname: event.target.value })} /></Field>
          <Field label={t("user.field.mobile")}><Input value={editing.mobile} onChange={(event) => setEditing({ ...editing, mobile: event.target.value })} placeholder={t("user.edit.mobilePlaceholder")} /></Field>
          <Field label={t("user.field.avatar")}><Input value={editing.avatar} onChange={(event) => setEditing({ ...editing, avatar: event.target.value })} /></Field>
          <Field label={t("user.field.status")}><Select value={editing.status} onChange={(event) => setEditing({ ...editing, status: Number(event.target.value) })}><option value="1">{t("user.status.enabled")}</option><option value="0">{t("user.status.disabled")}</option></Select></Field>
          {canProfileUpdate && <Field label={t("user.field.memberLevel")}><Select value={editing.levelId} onChange={(event) => setEditing({ ...editing, levelId: event.target.value })}><option value="">{t("user.defaultLevel")}</option>{(levels.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></Field>}
          {canProfileUpdate && <Field label={t("user.field.memberGroup")}><Select value={editing.groupId} onChange={(event) => setEditing({ ...editing, groupId: event.target.value })}><option value="">{t("user.ungrouped")}</option>{(groups.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></Field>}
        </form>}
      </Drawer>

      <Drawer open={Boolean(passwordUser)} onClose={() => { setPasswordUser(null); setPassword(""); setPasswordAgain(""); }} title={t("user.action.resetPassword")} description={passwordUser ? t("list.password.descriptionFor", { name: passwordUser.nickname || passwordUser.id }) : undefined} footer={<><Button variant="ghost" onClick={() => { setPasswordUser(null); setPassword(""); setPasswordAgain(""); }}>{t("user.cancel")}</Button><Button disabled={passwordMutation.isPending || password.length < 8 || password !== passwordAgain} onClick={() => passwordUser && passwordMutation.mutate({ id: passwordUser.id, password })}>{passwordMutation.isPending ? t("user.submitting") : t("user.password.confirm")}</Button></>}>
        <div className="space-y-4">
          <Field label={t("user.password.new")}><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("user.password.newPlaceholder")} /></Field>
          <Field label={t("user.password.again")}><Input type="password" autoComplete="new-password" value={passwordAgain} onChange={(e) => setPasswordAgain(e.target.value)} placeholder={t("user.password.againPlaceholder")} /></Field>
          {password.length > 0 && password.length < 8 && <p className="text-xs text-red-600">{t("user.password.tooShort")}</p>}
          {passwordAgain.length > 0 && password !== passwordAgain && <p className="text-xs text-red-600">{t("user.password.mismatch")}</p>}
          <p className="text-[11px] text-[var(--muted-foreground)]">{t("user.password.hint")}</p>
        </div>
      </Drawer>
      <Drawer open={Boolean(pointUser)} onClose={() => setPointUser(null)} title={t("user.action.adjustPoint")} description={t("user.point.description")} footer={<><Button variant="ghost" onClick={() => setPointUser(null)}>{t("user.cancel")}</Button><Button onClick={() => pointUser && pointDelta !== 0 && pointMutation.mutate({ id: pointUser.id, point: pointDelta })} disabled={pointMutation.isPending || pointDelta === 0}>{pointMutation.isPending ? t("user.processing") : t("user.point.confirm")}</Button></>}>
        {pointUser && <div className="space-y-4">{actionError && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}<div className="rounded-2xl bg-[var(--hero)] p-5 text-white"><div className="text-xs text-white/45">{t("user.point.current")}</div><div className="mt-2 text-2xl font-semibold">{pointUser.point ?? 0}</div><div className="mt-4 text-xs text-[var(--primary)]">{t("user.point.after", { value: (pointUser.point ?? 0) + pointDelta })}</div></div><Field label={t("user.point.deltaLabel")}><Input type="number" value={pointDelta} onChange={(event) => setPointDelta(Number(event.target.value))} /></Field></div>}
      </Drawer>
    </div>
  );
}
