"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useMutation, usePermission, useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import { formatDateTime, type PageResponse } from "@neton/application-front-runtime/types";
import { WorkspaceLink, useTabTitle, useWorkspaceDirty, useWorkspaceRoute } from "@neton/application-front-workspace";
import {
  Button,
  DataTable,
  Drawer,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Textarea,
  type DataColumn,
} from "@neton/application-front-kit";

/** 账号资料。等级 / 分组 / 积分 / 成长值属于会员档案，见 [MemberProfile]。 */
interface AccountUser {
  id: number;
  identityProvider?: string | null;
  username?: string | null;
  usernameUpdatedAt?: number | null;
  mobile?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  gender?: number | null;
  bio?: string | null;
  birthday?: string | null;
  isRobot?: number | null;
  isGuest?: number | null;
  status?: number | null;
  registerIp?: string | null;
  registerRegion?: string | null;
  loginIp?: string | null;
  loginRegion?: string | null;
  loginDate?: number | null;
  createdAt?: number | null;
  updatedAt?: number | null;
}

interface SimpleOption { id: number; name?: string | null; }
interface MemberProfile { userId: number; levelId?: number | null; levelName?: string | null; experience: number; point: number; groupId?: number | null; groupName?: string | null }
interface Wallet { id: number; userId: number; balance: number; freezePrice: number; totalRecharge: number; totalExpense: number; accountFrozen?: boolean }
interface PointRecord { id: number; userId: number; bizType: number; bizId?: string | null; title: string; point: number; totalPoint: number; description?: string | null; createdAt?: number | null }
interface SignInRecord { id: number; userId: number; nickname?: string | null; day: number; point: number; experience: number; cashAmount: number; createdAt?: number | null }
interface LevelRecord { id: number; userId: number; levelId: number; level: number; reason?: string | null; description?: string | null; createdAt?: number | null }
interface AddressRow { id: number; name: string; mobile: string; areaCode?: string | null; detailAddress: string; defaultStatus: number }
interface Transaction { id: number; walletId: number; bizType: number; bizId: number; title: string; price: number; balance: number; createdAt?: number | null }

type Tab = "profile" | "point" | "signin" | "experience" | "level" | "balance" | "address";

const money = (value: number) => "¥" + (value / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GENDER: Record<number, string> = { 0: "未知", 1: "男", 2: "女" };

/**
 * 账号详情独立页（`/account/user/:id`）。
 *
 * 列表页的抽屉只能塞下只读快照；一个账号挂着积分、签到、成长值、等级变更、
 * 钱包流水和收货地址六条明细，外加五个写操作，抽屉里放不下也没法分页，所以
 * 走 standalone 页面 —— 和 privchat 用户详情同一套结构。
 *
 * 资料来自 account；会员档案（等级、分组、积分、成长值）和各条明细来自 member / pay，
 * 全部按权限点出现 —— 没装 member 或没有对应权限时，这些区块自然隐藏。
 */
export default function AccountUserDetailPage() {
  const client = useQueryClient();
  const canUpdate = usePermission("account:user:update");
  const canResetPassword = usePermission("account:user:update-password");
  const canProfile = usePermission("member:profile:query");
  const canProfileUpdate = usePermission("member:profile:update");
  const canPoint = usePermission("member:point:query");
  const canSignIn = usePermission("member:signin:query");
  const canLevel = usePermission("member:level:query");
  const canAddress = usePermission("member:address:query");
  const canWallet = usePermission("pay:wallet:query");
  const canWalletTx = usePermission("pay:wallet-transaction:query");
  const canWalletUpdate = usePermission("pay:wallet:update");

  // 参数取自**本实例**的路由，绝不读 window.location：保活后内存里同时活着多个
  // 详情实例，而地址栏只有一个；Activity 由隐藏转可见还会重跑 effect，直读全局
  // 地址会让这个实例在被切回来的瞬间指向别人的用户。
  const route = useWorkspaceRoute();
  const uid = Number(route.params.id) || 0;
  const [tab, setTab] = React.useState<Tab>("profile");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ mobile: string; nickname: string; avatar: string; status: number; groupId: string } | null>(null);
  const [pointDelta, setPointDelta] = React.useState(0);
  const [pointOpen, setPointOpen] = React.useState(false);
  const [levelOpen, setLevelOpen] = React.useState(false);
  const [levelId, setLevelId] = React.useState("");
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [passwordAgain, setPasswordAgain] = React.useState("");
  const [walletForm, setWalletForm] = React.useState<{ mode: "balance" | "recharge" | "deduct"; amount: number; remark: string } | null>(null);

  React.useEffect(() => setPage(1), [tab]);

  const user = useQuery({ queryKey: ["account-user-detail", uid], queryFn: () => apiFetch<AccountUser>(`/admin/account/user/get/${uid}`), enabled: uid > 0 });
  const profile = useQuery({ queryKey: ["member-user-profile", uid], queryFn: () => apiFetch<MemberProfile>(`/admin/member/user/profile/${uid}`), enabled: uid > 0 && canProfile });
  const levels = useQuery({ queryKey: ["member", "levels", "simple"], queryFn: () => apiFetch<SimpleOption[]>("/admin/member/level/list-all-simple"), enabled: canProfileUpdate });
  const groups = useQuery({ queryKey: ["member", "groups", "simple"], queryFn: () => apiFetch<SimpleOption[]>("/admin/member/group/list-all-simple"), enabled: canProfileUpdate });
  const wallet = useQuery({ queryKey: ["member-user-wallet", uid], queryFn: () => apiFetch<Wallet | null>(`/admin/pay/wallet/get-by-user-id?userId=${uid}`), enabled: uid > 0 && canWallet });

  const points = useQuery({ queryKey: ["member-user-points", uid, page, pageSize], queryFn: () => apiFetch<PageResponse<PointRecord>>(`/admin/member/point/record/page?userId=${uid}&pageNo=${page}&pageSize=${pageSize}`), enabled: uid > 0 && tab === "point" });
  const signIns = useQuery({ queryKey: ["member-user-signins", uid, page, pageSize], queryFn: () => apiFetch<PageResponse<SignInRecord>>(`/admin/member/sign-in/record/page-all?userId=${uid}&pageNo=${page}&pageSize=${pageSize}`), enabled: uid > 0 && tab === "signin" });
  const experiences = useQuery({ queryKey: ["member-user-experiences", uid, page, pageSize], queryFn: () => apiFetch<PageResponse<PointRecord>>(`/admin/member/experience-record/page?userId=${uid}&pageNo=${page}&pageSize=${pageSize}`), enabled: uid > 0 && tab === "experience" });
  const levelRecords = useQuery({ queryKey: ["member-user-level-records", uid, page, pageSize], queryFn: () => apiFetch<PageResponse<LevelRecord>>(`/admin/member/level-record/page?userId=${uid}&pageNo=${page}&pageSize=${pageSize}`), enabled: uid > 0 && tab === "level" });
  const addresses = useQuery({ queryKey: ["member-user-addresses", uid], queryFn: () => apiFetch<AddressRow[]>(`/admin/member/address/list?userId=${uid}`), enabled: uid > 0 && tab === "address" });
  const walletId = wallet.data?.id;
  const transactions = useQuery({ queryKey: ["member-user-wallet-tx", walletId, page, pageSize], queryFn: () => apiFetch<PageResponse<Transaction>>(`/admin/pay/wallet-transaction/page-by-wallet?walletId=${walletId}&pageNo=${page}&pageSize=${pageSize}`), enabled: tab === "balance" && Boolean(walletId) && canWalletTx });

  async function refreshUser() {
    await client.invalidateQueries({ queryKey: ["account-user-detail", uid] });
    await client.invalidateQueries({ queryKey: ["member-user-profile", uid] });
  }

  const saveMutation = useMutation({
    mutationFn: async (value: NonNullable<typeof editing>) => {
      await apiWrite<void>("/admin/account/user/update", "PUT", {
        id: uid,
        mobile: value.mobile.trim() ? value.mobile.trim().replace(/^\+86/, "") : null,
        nickname: value.nickname.trim(),
        avatar: value.avatar.trim() || null,
        status: value.status,
      });
      // 分组属于会员档案，只在确实改了时才写；等级有单独的「修改等级」入口（会留变更记录）。
      if (canProfileUpdate) {
        const groupId = value.groupId ? Number(value.groupId) : null;
        if (groupId !== (profile.data?.groupId ?? null)) {
          await apiWrite<void>("/admin/member/user/update-group", "PUT", { id: uid, groupId });
        }
      }
    },
    onSuccess: async () => { setEditing(null); await refreshUser(); },
    onError: (error: Error) => setActionError(error.message),
  });

  const levelMutation = useMutation({
    mutationFn: (value: string) => apiWrite<void>("/admin/member/user/update-level", "PUT", { id: uid, levelId: Number(value) }),
    onSuccess: async () => {
      setLevelOpen(false);
      await refreshUser();
      await client.invalidateQueries({ queryKey: ["member-user-level-records", uid] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const pointMutation = useMutation({
    mutationFn: (delta: number) => apiWrite<void>("/admin/member/user/update-point", "PUT", { id: uid, point: delta }),
    onSuccess: async () => {
      setPointOpen(false);
      setPointDelta(0);
      await refreshUser();
      await client.invalidateQueries({ queryKey: ["member-user-points", uid] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  /** 明文只用于这一次请求：成功或关窗都清空，不留在组件状态里。 */
  const passwordMutation = useMutation({
    mutationFn: (value: string) => apiWrite<void>("/admin/account/user/update-password", "PUT", { id: uid, password: value }),
    onSuccess: () => closePassword(),
    onError: (error: Error) => setActionError(error.message),
  });

  const walletMutation = useMutation({
    mutationFn: (value: NonNullable<typeof walletForm>) => value.mode === "balance"
      ? apiWrite<void>("/admin/pay/wallet/update-balance", "PUT", { userId: uid, balance: value.amount })
      : apiWrite<void>(`/admin/pay/wallet/manual-${value.mode}`, "POST", { userId: uid, amount: value.amount, remark: value.remark.trim() }),
    onSuccess: async () => {
      setWalletForm(null);
      await client.invalidateQueries({ queryKey: ["member-user-wallet", uid] });
      await client.invalidateQueries({ queryKey: ["member-user-wallet-tx"] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  function closePassword() {
    setPasswordOpen(false);
    setPassword("");
    setPasswordAgain("");
  }

  const current = user.data;
  const growth = canProfile ? profile.data : undefined;
  const title = current?.nickname || current?.username || `账号 ${uid || ""}`;
  // 页签标题：加载出来后换成真名；没加载出来时沿用注册表默认标题「账号详情 · 46」。
  // 标题必须带业务域：同一个人的「账号资料」和「IM 用户资料」是两个页签，
  // 只写 `名字 · id` 时两者会长得一模一样，分不出点开的是哪一个。
  useTabTitle(current ? `${title} · 账号 ${uid}` : null);
  // 有编辑中的抽屉 = 有未保存内容：页签打脏点，关闭要二次确认。
  useWorkspaceDirty(Boolean(editing) || Boolean(walletForm) || passwordOpen || levelOpen || pointOpen);

  const pointColumns: DataColumn<PointRecord>[] = [
    { key: "id", header: "编号", cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "title", header: "标题", cell: (row) => <div><strong>{row.title}</strong>{row.description && <div className="text-xs text-[var(--muted-foreground)]">{row.description}</div>}</div> },
    { key: "bizType", header: "业务类型", cell: (row) => row.bizType },
    { key: "point", header: "变动", cell: (row) => <span className={`font-mono text-xs font-semibold ${row.point < 0 ? "text-red-600" : "text-[var(--primary)]"}`}>{row.point > 0 ? `+${row.point}` : row.point}</span> },
    { key: "totalPoint", header: "变动后", cell: (row) => <span className="font-mono text-xs">{row.totalPoint}</span> },
    { key: "createdAt", header: "时间", cell: (row) => formatDateTime(row.createdAt) },
  ];

  const signInColumns: DataColumn<SignInRecord>[] = [
    { key: "id", header: "编号", cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "day", header: "连续天数", cell: (row) => `第 ${row.day} 天` },
    { key: "point", header: "积分", cell: (row) => row.point },
    { key: "experience", header: "经验", cell: (row) => row.experience },
    { key: "cash", header: "现金奖励", cell: (row) => (row.cashAmount ? money(row.cashAmount) : "-") },
    { key: "createdAt", header: "时间", cell: (row) => formatDateTime(row.createdAt) },
  ];

  const experienceColumns: DataColumn<PointRecord>[] = [
    { key: "id", header: "编号", cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "title", header: "标题", cell: (row) => row.title },
    { key: "point", header: "变动成长值", cell: (row) => <span className="font-mono text-xs font-semibold">{row.point > 0 ? `+${row.point}` : row.point}</span> },
    { key: "totalPoint", header: "变动后", cell: (row) => <span className="font-mono text-xs">{row.totalPoint}</span> },
    { key: "createdAt", header: "时间", cell: (row) => formatDateTime(row.createdAt) },
  ];

  const levelColumns: DataColumn<LevelRecord>[] = [
    { key: "id", header: "编号", cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "level", header: "等级", cell: (row) => <div><strong>Lv.{row.level}</strong><div className="text-xs text-[var(--muted-foreground)]">等级 ID {row.levelId}</div></div> },
    { key: "reason", header: "原因", cell: (row) => row.reason || "-" },
    { key: "description", header: "说明", cell: (row) => row.description || "-" },
    { key: "createdAt", header: "时间", cell: (row) => formatDateTime(row.createdAt) },
  ];

  const addressColumns: DataColumn<AddressRow>[] = [
    { key: "name", header: "收件人", cell: (row) => <div><strong>{row.name}</strong><div className="text-xs text-[var(--muted-foreground)]">{row.mobile}</div></div> },
    { key: "detail", header: "地址", cell: (row) => <span className="break-all">{row.areaCode ? `${row.areaCode} ` : ""}{row.detailAddress}</span> },
    { key: "default", header: "默认", cell: (row) => <StatusBadge active={row.defaultStatus === 1}>{row.defaultStatus === 1 ? "默认地址" : "普通"}</StatusBadge> },
  ];

  const transactionColumns: DataColumn<Transaction>[] = [
    { key: "id", header: "编号", cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "title", header: "标题", cell: (row) => <div><strong>{row.title}</strong><div className="text-xs text-[var(--muted-foreground)]">业务 {row.bizType} · {row.bizId}</div></div> },
    { key: "price", header: "金额", cell: (row) => <span className={`font-mono text-xs font-semibold ${row.price < 0 ? "text-red-600" : "text-[var(--primary)]"}`}>{row.price > 0 ? `+${money(row.price)}` : money(row.price)}</span> },
    { key: "balance", header: "变动后余额", cell: (row) => <span className="font-mono text-xs">{money(row.balance)}</span> },
    { key: "createdAt", header: "时间", cell: (row) => formatDateTime(row.createdAt) },
  ];

  const tabs: Array<[Tab, string, boolean]> = [
    ["profile", "基本资料", true],
    ["point", "积分记录", canPoint],
    ["signin", "签到记录", canSignIn],
    ["experience", "成长值", canLevel],
    ["level", "等级变更", canLevel],
    ["balance", "余额流水", canWallet && canWalletTx],
    ["address", "收货地址", canAddress],
  ];

  const profileFields: Array<[string, React.ReactNode]> = current ? [
    ["用户名", current.username || "未设置"],
    ["昵称", current.nickname || "未设置"],
    ["手机号", current.mobile || "未绑定"],
    ["身份来源", current.identityProvider || "builtin"],
    ["性别", GENDER[current.gender ?? 0] || "未知"],
    ["生日", current.birthday || "-"],
    ["个性签名", current.bio || "-"],
    ...(growth ? [["等级", growth.levelName || "默认等级"], ["分组", growth.groupName || "未分组"]] as Array<[string, React.ReactNode]> : []),
    ["账号类型", current.isRobot === 1 ? "陪玩机器人" : current.isGuest === 1 ? "游客" : "普通账号"],
    ["注册 IP", current.registerIp || "-"],
    ["注册地区", current.registerRegion || "-"],
    ["登录 IP", current.loginIp || "-"],
    ["登录地区", current.loginRegion || "-"],
    ["最近登录", formatDateTime(current.loginDate)],
    ["注册时间", formatDateTime(current.createdAt)],
    ["更新时间", formatDateTime(current.updatedAt)],
    ["用户名修改于", current.usernameUpdatedAt ? formatDateTime(current.usernameUpdatedAt) : "从未修改"],
  ] : [];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="ACCOUNT PROFILE"
        title={title}
        description="独立账号详情页，集中查看资料、资产与全部账户明细，并执行管理操作。"
        actions={
          <>
            <WorkspaceLink to="/account/user" className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold">返回列表</WorkspaceLink>
            {canUpdate && current && <Button variant="outline" onClick={() => { setActionError(null); setEditing({ mobile: current.mobile ?? "", nickname: current.nickname ?? "", avatar: current.avatar ?? "", status: current.status ?? 1, groupId: profile.data?.groupId ? String(profile.data.groupId) : "" }); }}>编辑资料</Button>}
            {canProfileUpdate && current && <Button variant="outline" onClick={() => { setActionError(null); setLevelId(profile.data?.levelId ? String(profile.data.levelId) : ""); setLevelOpen(true); }}>修改等级</Button>}
            {canProfileUpdate && <Button variant="outline" onClick={() => { setActionError(null); setPointDelta(0); setPointOpen(true); }}>调整积分</Button>}
            {canWalletUpdate && <Button variant="outline" onClick={() => { setActionError(null); setWalletForm({ mode: "recharge", amount: 0, remark: "" }); }}>调整余额</Button>}
            {canResetPassword && <Button variant="outline" onClick={() => { setActionError(null); setPassword(""); setPasswordAgain(""); setPasswordOpen(true); }}>重设密码</Button>}
          </>
        }
      />

      {user.error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{user.error.message}</div>}

      {current && (
        <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center gap-4">
              {current.avatar
                ? <img src={current.avatar} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                : <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-xl font-bold text-[var(--primary)]">{title.slice(0, 1).toUpperCase()}</span>}
              <div>
                <h2 className="text-lg font-bold">{title}</h2>
                <p className="text-xs text-[var(--muted-foreground)]">Account #{current.id} · {current.identityProvider || "builtin"} · {current.mobile || "未绑定手机"}</p>
              </div>
            </div>
            <StatusBadge active={current.status !== 0}>{current.status === 0 ? "停用" : "启用"}</StatusBadge>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
            <Metric label="积分" value={growth ? String(growth.point) : "-"} />
            <Metric label="成长值" value={growth ? String(growth.experience) : "-"} />
            <Metric label="余额" value={canWallet ? money(wallet.data?.balance ?? 0) : "无权限"} />
            <Metric label="冻结" value={canWallet ? money(wallet.data?.freezePrice ?? 0) : "-"} />
          </div>
        </section>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
        {tabs.filter(([, , allowed]) => allowed).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"}`}>{label}</button>
        ))}
      </div>

      {tab === "profile" && current && (
        <section className="grid gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
          {profileFields.map(([label, value]) => (
            <div key={label} className="bg-[var(--card)] p-4">
              <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
              <div className="mt-2 break-all text-sm font-semibold">{value || "-"}</div>
            </div>
          ))}
        </section>
      )}

      {tab === "point" && <TableCard><DataTable columns={pointColumns} rows={points.data?.list ?? []} rowKey={(row) => row.id} loading={points.isPending} error={points.error?.message} minWidth={860} /><Pagination page={page} pageSize={pageSize} total={points.data?.total ?? 0} loading={points.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>}
      {tab === "signin" && <TableCard><DataTable columns={signInColumns} rows={signIns.data?.list ?? []} rowKey={(row) => row.id} loading={signIns.isPending} error={signIns.error?.message} /><Pagination page={page} pageSize={pageSize} total={signIns.data?.total ?? 0} loading={signIns.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>}
      {tab === "experience" && <TableCard><DataTable columns={experienceColumns} rows={experiences.data?.list ?? []} rowKey={(row) => row.id} loading={experiences.isPending} error={experiences.error?.message} /><Pagination page={page} pageSize={pageSize} total={experiences.data?.total ?? 0} loading={experiences.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>}
      {tab === "level" && <TableCard><DataTable columns={levelColumns} rows={levelRecords.data?.list ?? []} rowKey={(row) => row.id} loading={levelRecords.isPending} error={levelRecords.error?.message} /><Pagination page={page} pageSize={pageSize} total={levelRecords.data?.total ?? 0} loading={levelRecords.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>}
      {tab === "balance" && (walletId
        ? <TableCard><DataTable columns={transactionColumns} rows={transactions.data?.list ?? []} rowKey={(row) => row.id} loading={transactions.isPending} error={transactions.error?.message} minWidth={860} /><Pagination page={page} pageSize={pageSize} total={transactions.data?.total ?? 0} loading={transactions.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>
        : <EmptyCard text={wallet.isPending ? "正在加载钱包…" : "该账号还没有开通钱包，产生第一笔资金流水后自动创建。"} />)}
      {tab === "address" && <TableCard><DataTable columns={addressColumns} rows={addresses.data ?? []} rowKey={(row) => row.id} loading={addresses.isPending} error={addresses.error?.message} /></TableCard>}

      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title="编辑账号" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>取消</Button><Button type="submit" form="account-detail-edit-form" disabled={saveMutation.isPending}>{saveMutation.isPending ? "保存中…" : "保存账号"}</Button></>}>
        {editing && <form id="account-detail-edit-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!editing.nickname.trim()) return setActionError("昵称不能为空"); setActionError(null); saveMutation.mutate(editing); }}>
          {actionError && <ErrorLine text={actionError} />}
          <Field label="昵称"><Input value={editing.nickname} onChange={(event) => setEditing({ ...editing, nickname: event.target.value })} /></Field>
          <Field label="手机号"><Input value={editing.mobile} onChange={(event) => setEditing({ ...editing, mobile: event.target.value })} placeholder="中国大陆手机号" /></Field>
          <Field label="头像 URL"><Input value={editing.avatar} onChange={(event) => setEditing({ ...editing, avatar: event.target.value })} /></Field>
          <Field label="状态"><Select value={editing.status} onChange={(event) => setEditing({ ...editing, status: Number(event.target.value) })}><option value="1">启用</option><option value="0">停用</option></Select></Field>
          {canProfileUpdate && <Field label="会员分组"><Select value={editing.groupId} onChange={(event) => setEditing({ ...editing, groupId: event.target.value })}><option value="">未分组</option>{(groups.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></Field>}
        </form>}
      </Drawer>

      <Drawer open={levelOpen} onClose={() => setLevelOpen(false)} title="修改会员等级" description="直接改等级会写入一条等级变更记录，不改动成长值。" footer={<><Button variant="ghost" onClick={() => setLevelOpen(false)}>取消</Button><Button disabled={!levelId || levelMutation.isPending} onClick={() => levelMutation.mutate(levelId)}>{levelMutation.isPending ? "提交中…" : "确认修改"}</Button></>}>
        <div className="space-y-4">
          {actionError && <ErrorLine text={actionError} />}
          <Field label="目标等级"><Select value={levelId} onChange={(event) => setLevelId(event.target.value)}><option value="">请选择等级</option>{(levels.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></Field>
        </div>
      </Drawer>

      <Drawer open={pointOpen} onClose={() => setPointOpen(false)} title="调整积分" description="积分变更会写入会员积分流水。" footer={<><Button variant="ghost" onClick={() => setPointOpen(false)}>取消</Button><Button disabled={pointMutation.isPending || pointDelta === 0} onClick={() => pointMutation.mutate(pointDelta)}>{pointMutation.isPending ? "处理中…" : "确认调整"}</Button></>}>
        <div className="space-y-4">
          {actionError && <ErrorLine text={actionError} />}
          <div className="rounded-2xl bg-[var(--hero)] p-5 text-white">
            <div className="text-xs text-white/45">当前积分</div>
            <div className="mt-2 text-2xl font-semibold">{growth?.point ?? 0}</div>
            <div className="mt-4 text-xs text-[var(--primary)]">调整后 {(growth?.point ?? 0) + pointDelta}</div>
          </div>
          <Field label="变更值（增加填正数，扣减填负数）"><Input type="number" value={pointDelta} onChange={(event) => setPointDelta(Number(event.target.value))} /></Field>
        </div>
      </Drawer>

      <Drawer open={Boolean(walletForm)} onClose={() => setWalletForm(null)} title="调整余额" description="手动充值 / 划扣会写入钱包流水并留下操作人；直接改余额不产生业务凭据，仅用于纠错。" footer={<><Button variant="ghost" onClick={() => setWalletForm(null)}>取消</Button><Button disabled={walletMutation.isPending || !walletForm || walletForm.amount === 0 || (walletForm.mode !== "balance" && !walletForm.remark.trim())} onClick={() => walletForm && walletMutation.mutate(walletForm)}>{walletMutation.isPending ? "处理中…" : "确认提交"}</Button></>}>
        {walletForm && <div className="space-y-4">
          {actionError && <ErrorLine text={actionError} />}
          <div className="rounded-2xl bg-[var(--hero)] p-5 text-white">
            <div className="text-xs text-white/45">当前余额</div>
            <div className="mt-2 text-2xl font-semibold">{money(wallet.data?.balance ?? 0)}</div>
            <div className="mt-4 text-xs text-white/45">累计充值 {money(wallet.data?.totalRecharge ?? 0)} · 累计消费 {money(wallet.data?.totalExpense ?? 0)}</div>
          </div>
          <Field label="操作类型"><Select value={walletForm.mode} onChange={(event) => setWalletForm({ ...walletForm, mode: event.target.value as "balance" | "recharge" | "deduct" })}><option value="recharge">手动充值</option><option value="deduct">手动划扣</option><option value="balance">直接修改余额</option></Select></Field>
          <Field label="金额（分）"><Input type="number" value={walletForm.amount} onChange={(event) => setWalletForm({ ...walletForm, amount: Number(event.target.value) })} /></Field>
          <p className="text-[11px] text-[var(--muted-foreground)]">= {money(walletForm.amount || 0)}</p>
          {walletForm.mode !== "balance" && <Field label="备注（必填，进流水可追溯）"><Textarea value={walletForm.remark} onChange={(event) => setWalletForm({ ...walletForm, remark: event.target.value })} /></Field>}
        </div>}
      </Drawer>

      <Drawer open={passwordOpen} onClose={closePassword} title="重设密码" description="管理员改密不需要旧密码。" footer={<><Button variant="ghost" onClick={closePassword}>取消</Button><Button disabled={passwordMutation.isPending || password.length < 8 || password !== passwordAgain} onClick={() => passwordMutation.mutate(password)}>{passwordMutation.isPending ? "提交中…" : "确认重设"}</Button></>}>
        <div className="space-y-4">
          {actionError && <ErrorLine text={actionError} />}
          <Field label="新密码"><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" /></Field>
          <Field label="确认新密码"><Input type="password" autoComplete="new-password" value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} placeholder="再输入一次" /></Field>
          {password.length > 0 && password.length < 8 && <p className="text-xs text-red-600">密码至少 8 位（与注册链路同一条规则）。</p>}
          {passwordAgain.length > 0 && password !== passwordAgain && <p className="text-xs text-red-600">两次输入不一致。</p>}
          <p className="text-[11px] text-[var(--muted-foreground)]">改完请通过安全渠道告知本人；这里不回显、也不保存明文。</p>
        </div>
      </Drawer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-[var(--card)] p-4"><div className="text-xs text-[var(--muted-foreground)]">{label}</div><div className="mt-2 break-all text-sm font-bold text-[var(--foreground)]">{value}</div></div>;
}

function TableCard({ children }: { children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">{children}</section>;
}

function EmptyCard({ text }: { text: string }) {
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-10 text-center text-sm text-[var(--muted-foreground)]">{text}</section>;
}

function ErrorLine({ text }: { text: string }) {
  return <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{text}</div>;
}
