"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useMutation, usePermission, useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import { formatDateTime, formatMoney, type PageResponse } from "@neton/application-front-runtime/types";
import { useT, type Translate } from "@neton/application-front-runtime/i18n";
import { useDescribeError } from "@neton/application-front-runtime/errors";
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

/** 钱包金额是「分」；钱包记录不带币种，走部署默认币种。 */
const money = (value: number) => formatMoney(value);
const genderLabel = (t: Translate, gender: number) => (gender === 1 ? t("detail.gender.male") : gender === 2 ? t("detail.gender.female") : t("detail.gender.unknown"));

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
  const t = useT("account");
  const describeError = useDescribeError();
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
    onError: (error: Error) => setActionError(describeError(error)),
  });

  const levelMutation = useMutation({
    mutationFn: (value: string) => apiWrite<void>("/admin/member/user/update-level", "PUT", { id: uid, levelId: Number(value) }),
    onSuccess: async () => {
      setLevelOpen(false);
      await refreshUser();
      await client.invalidateQueries({ queryKey: ["member-user-level-records", uid] });
    },
    onError: (error: Error) => setActionError(describeError(error)),
  });

  const pointMutation = useMutation({
    mutationFn: (delta: number) => apiWrite<void>("/admin/member/user/update-point", "PUT", { id: uid, point: delta }),
    onSuccess: async () => {
      setPointOpen(false);
      setPointDelta(0);
      await refreshUser();
      await client.invalidateQueries({ queryKey: ["member-user-points", uid] });
    },
    onError: (error: Error) => setActionError(describeError(error)),
  });

  /** 明文只用于这一次请求：成功或关窗都清空，不留在组件状态里。 */
  const passwordMutation = useMutation({
    mutationFn: (value: string) => apiWrite<void>("/admin/account/user/update-password", "PUT", { id: uid, password: value }),
    onSuccess: () => closePassword(),
    onError: (error: Error) => setActionError(describeError(error)),
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
    onError: (error: Error) => setActionError(describeError(error)),
  });

  function closePassword() {
    setPasswordOpen(false);
    setPassword("");
    setPasswordAgain("");
  }

  const current = user.data;
  const growth = canProfile ? profile.data : undefined;
  const title = current?.nickname || current?.username || t("detail.fallbackTitle", { id: uid || "" });
  // 页签标题：加载出来后换成真名；没加载出来时沿用注册表默认标题「账号详情 · 46」。
  // 标题必须带业务域：同一个人的「账号资料」和「IM 用户资料」是两个页签，
  // 只写 `名字 · id` 时两者会长得一模一样，分不出点开的是哪一个。
  useTabTitle(current ? t("detail.tabTitle", { title, id: uid }) : null);
  // 有编辑中的抽屉 = 有未保存内容：页签打脏点，关闭要二次确认。
  useWorkspaceDirty(Boolean(editing) || Boolean(walletForm) || passwordOpen || levelOpen || pointOpen);

  const pointColumns: DataColumn<PointRecord>[] = [
    { key: "id", header: t("detail.field.id"), cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "title", header: t("detail.field.title"), cell: (row) => <div><strong>{row.title}</strong>{row.description && <div className="text-xs text-[var(--muted-foreground)]">{row.description}</div>}</div> },
    { key: "bizType", header: t("detail.field.bizType"), cell: (row) => row.bizType },
    { key: "point", header: t("detail.field.change"), cell: (row) => <span className={`font-mono text-xs font-semibold ${row.point < 0 ? "text-red-600" : "text-[var(--primary)]"}`}>{row.point > 0 ? `+${row.point}` : row.point}</span> },
    { key: "totalPoint", header: t("detail.field.after"), cell: (row) => <span className="font-mono text-xs">{row.totalPoint}</span> },
    { key: "createdAt", header: t("detail.field.time"), cell: (row) => formatDateTime(row.createdAt) },
  ];

  const signInColumns: DataColumn<SignInRecord>[] = [
    { key: "id", header: t("detail.field.id"), cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "day", header: t("detail.signin.day"), cell: (row) => t("detail.signin.dayValue", { day: row.day }) },
    { key: "point", header: t("user.field.point"), cell: (row) => row.point },
    { key: "experience", header: t("detail.signin.experience"), cell: (row) => row.experience },
    { key: "cash", header: t("detail.signin.cash"), cell: (row) => (row.cashAmount ? money(row.cashAmount) : "-") },
    { key: "createdAt", header: t("detail.field.time"), cell: (row) => formatDateTime(row.createdAt) },
  ];

  const experienceColumns: DataColumn<PointRecord>[] = [
    { key: "id", header: t("detail.field.id"), cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "title", header: t("detail.field.title"), cell: (row) => row.title },
    { key: "point", header: t("detail.experience.change"), cell: (row) => <span className="font-mono text-xs font-semibold">{row.point > 0 ? `+${row.point}` : row.point}</span> },
    { key: "totalPoint", header: t("detail.field.after"), cell: (row) => <span className="font-mono text-xs">{row.totalPoint}</span> },
    { key: "createdAt", header: t("detail.field.time"), cell: (row) => formatDateTime(row.createdAt) },
  ];

  const levelColumns: DataColumn<LevelRecord>[] = [
    { key: "id", header: t("detail.field.id"), cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "level", header: t("user.field.level"), cell: (row) => <div><strong>Lv.{row.level}</strong><div className="text-xs text-[var(--muted-foreground)]">{t("detail.level.levelId", { id: row.levelId })}</div></div> },
    { key: "reason", header: t("detail.level.reason"), cell: (row) => row.reason || "-" },
    { key: "description", header: t("detail.level.description"), cell: (row) => row.description || "-" },
    { key: "createdAt", header: t("detail.field.time"), cell: (row) => formatDateTime(row.createdAt) },
  ];

  const addressColumns: DataColumn<AddressRow>[] = [
    { key: "name", header: t("detail.address.receiver"), cell: (row) => <div><strong>{row.name}</strong><div className="text-xs text-[var(--muted-foreground)]">{row.mobile}</div></div> },
    { key: "detail", header: t("detail.address.address"), cell: (row) => <span className="break-all">{row.areaCode ? `${row.areaCode} ` : ""}{row.detailAddress}</span> },
    { key: "default", header: t("detail.address.default"), cell: (row) => <StatusBadge active={row.defaultStatus === 1}>{row.defaultStatus === 1 ? t("detail.address.isDefault") : t("detail.address.normal")}</StatusBadge> },
  ];

  const transactionColumns: DataColumn<Transaction>[] = [
    { key: "id", header: t("detail.field.id"), cell: (row) => <code className="text-xs">{row.id}</code> },
    { key: "title", header: t("detail.field.title"), cell: (row) => <div><strong>{row.title}</strong><div className="text-xs text-[var(--muted-foreground)]">{t("detail.tx.biz", { bizType: row.bizType, bizId: row.bizId })}</div></div> },
    { key: "price", header: t("detail.tx.amount"), cell: (row) => <span className={`font-mono text-xs font-semibold ${row.price < 0 ? "text-red-600" : "text-[var(--primary)]"}`}>{row.price > 0 ? `+${money(row.price)}` : money(row.price)}</span> },
    { key: "balance", header: t("detail.tx.balanceAfter"), cell: (row) => <span className="font-mono text-xs">{money(row.balance)}</span> },
    { key: "createdAt", header: t("detail.field.time"), cell: (row) => formatDateTime(row.createdAt) },
  ];

  const tabs: Array<[Tab, string, boolean]> = [
    ["profile", t("detail.tab.profile"), true],
    ["point", t("detail.tab.point"), canPoint],
    ["signin", t("detail.tab.signin"), canSignIn],
    ["experience", t("detail.tab.experience"), canLevel],
    ["level", t("detail.tab.level"), canLevel],
    ["balance", t("detail.tab.balance"), canWallet && canWalletTx],
    ["address", t("detail.tab.address"), canAddress],
  ];

  const profileFields: Array<[string, React.ReactNode]> = current ? [
    [t("user.field.username"), current.username || t("user.notSet")],
    [t("user.field.nickname"), current.nickname || t("user.notSet")],
    [t("user.field.mobile"), current.mobile || t("user.unbound")],
    [t("user.field.identitySource"), current.identityProvider || "builtin"],
    [t("detail.field.gender"), genderLabel(t, current.gender ?? 0)],
    [t("detail.field.birthday"), current.birthday || "-"],
    [t("detail.field.bio"), current.bio || "-"],
    ...(growth ? [[t("user.field.level"), growth.levelName || t("user.defaultLevel")], [t("user.field.group"), growth.groupName || t("user.ungrouped")]] as Array<[string, React.ReactNode]> : []),
    [t("detail.field.accountType"), current.isRobot === 1 ? t("detail.accountType.robot") : current.isGuest === 1 ? t("detail.accountType.guest") : t("detail.accountType.normal")],
    [t("user.field.registerIp"), current.registerIp || "-"],
    [t("detail.field.registerRegion"), current.registerRegion || "-"],
    [t("user.field.loginIp"), current.loginIp || "-"],
    [t("user.field.loginRegion"), current.loginRegion || "-"],
    [t("user.field.lastLogin"), formatDateTime(current.loginDate)],
    [t("user.field.createdAt"), formatDateTime(current.createdAt)],
    [t("detail.field.updatedAt"), formatDateTime(current.updatedAt)],
    [t("detail.field.usernameUpdatedAt"), current.usernameUpdatedAt ? formatDateTime(current.usernameUpdatedAt) : t("detail.usernameNeverChanged")],
  ] : [];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={t("detail.eyebrow")}
        title={title}
        description={t("detail.description")}
        actions={
          <>
            <WorkspaceLink to="/account/user" className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold">{t("detail.backToList")}</WorkspaceLink>
            {canUpdate && current && <Button variant="outline" onClick={() => { setActionError(null); setEditing({ mobile: current.mobile ?? "", nickname: current.nickname ?? "", avatar: current.avatar ?? "", status: current.status ?? 1, groupId: profile.data?.groupId ? String(profile.data.groupId) : "" }); }}>{t("detail.action.editProfile")}</Button>}
            {canProfileUpdate && current && <Button variant="outline" onClick={() => { setActionError(null); setLevelId(profile.data?.levelId ? String(profile.data.levelId) : ""); setLevelOpen(true); }}>{t("detail.action.changeLevel")}</Button>}
            {canProfileUpdate && <Button variant="outline" onClick={() => { setActionError(null); setPointDelta(0); setPointOpen(true); }}>{t("user.action.adjustPoint")}</Button>}
            {canWalletUpdate && <Button variant="outline" onClick={() => { setActionError(null); setWalletForm({ mode: "recharge", amount: 0, remark: "" }); }}>{t("detail.action.adjustBalance")}</Button>}
            {canResetPassword && <Button variant="outline" onClick={() => { setActionError(null); setPassword(""); setPasswordAgain(""); setPasswordOpen(true); }}>{t("user.action.resetPassword")}</Button>}
          </>
        }
      />

      {user.error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{describeError(user.error)}</div>}

      {current && (
        <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center gap-4">
              {current.avatar
                ? <img src={current.avatar} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                : <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-xl font-bold text-[var(--primary)]">{title.slice(0, 1).toUpperCase()}</span>}
              <div>
                <h2 className="text-lg font-bold">{title}</h2>
                <p className="text-xs text-[var(--muted-foreground)]">{t("user.accountNo", { id: current.id })} · {current.identityProvider || "builtin"} · {current.mobile || t("detail.mobileUnbound")}</p>
              </div>
            </div>
            <StatusBadge active={current.status !== 0}>{current.status === 0 ? t("user.status.disabled") : t("user.status.enabled")}</StatusBadge>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
            <Metric label={t("user.field.point")} value={growth ? String(growth.point) : "-"} />
            <Metric label={t("detail.tab.experience")} value={growth ? String(growth.experience) : "-"} />
            <Metric label={t("detail.metric.balance")} value={canWallet ? money(wallet.data?.balance ?? 0) : t("detail.metric.noPermission")} />
            <Metric label={t("detail.metric.frozen")} value={canWallet ? money(wallet.data?.freezePrice ?? 0) : "-"} />
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

      {tab === "point" && <TableCard><DataTable columns={pointColumns} rows={points.data?.list ?? []} rowKey={(row) => row.id} loading={points.isPending} error={points.error ? describeError(points.error) : null} minWidth={860} /><Pagination page={page} pageSize={pageSize} total={points.data?.total ?? 0} loading={points.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>}
      {tab === "signin" && <TableCard><DataTable columns={signInColumns} rows={signIns.data?.list ?? []} rowKey={(row) => row.id} loading={signIns.isPending} error={signIns.error ? describeError(signIns.error) : null} /><Pagination page={page} pageSize={pageSize} total={signIns.data?.total ?? 0} loading={signIns.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>}
      {tab === "experience" && <TableCard><DataTable columns={experienceColumns} rows={experiences.data?.list ?? []} rowKey={(row) => row.id} loading={experiences.isPending} error={experiences.error ? describeError(experiences.error) : null} /><Pagination page={page} pageSize={pageSize} total={experiences.data?.total ?? 0} loading={experiences.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>}
      {tab === "level" && <TableCard><DataTable columns={levelColumns} rows={levelRecords.data?.list ?? []} rowKey={(row) => row.id} loading={levelRecords.isPending} error={levelRecords.error ? describeError(levelRecords.error) : null} /><Pagination page={page} pageSize={pageSize} total={levelRecords.data?.total ?? 0} loading={levelRecords.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>}
      {tab === "balance" && (walletId
        ? <TableCard><DataTable columns={transactionColumns} rows={transactions.data?.list ?? []} rowKey={(row) => row.id} loading={transactions.isPending} error={transactions.error ? describeError(transactions.error) : null} minWidth={860} /><Pagination page={page} pageSize={pageSize} total={transactions.data?.total ?? 0} loading={transactions.isFetching} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></TableCard>
        : <EmptyCard text={wallet.isPending ? t("detail.wallet.loading") : t("detail.wallet.none")} />)}
      {tab === "address" && <TableCard><DataTable columns={addressColumns} rows={addresses.data ?? []} rowKey={(row) => row.id} loading={addresses.isPending} error={addresses.error ? describeError(addresses.error) : null} /></TableCard>}

      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title={t("user.edit.title")} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>{t("user.cancel")}</Button><Button type="submit" form="account-detail-edit-form" disabled={saveMutation.isPending}>{saveMutation.isPending ? t("user.edit.saving") : t("user.edit.save")}</Button></>}>
        {editing && <form id="account-detail-edit-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!editing.nickname.trim()) return setActionError(t("user.edit.nicknameRequired")); setActionError(null); saveMutation.mutate(editing); }}>
          {actionError && <ErrorLine text={actionError} />}
          <Field label={t("user.field.nickname")}><Input value={editing.nickname} onChange={(event) => setEditing({ ...editing, nickname: event.target.value })} /></Field>
          <Field label={t("user.field.mobile")}><Input value={editing.mobile} onChange={(event) => setEditing({ ...editing, mobile: event.target.value })} placeholder={t("user.edit.mobilePlaceholder")} /></Field>
          <Field label={t("user.field.avatar")}><Input value={editing.avatar} onChange={(event) => setEditing({ ...editing, avatar: event.target.value })} /></Field>
          <Field label={t("user.field.status")}><Select value={editing.status} onChange={(event) => setEditing({ ...editing, status: Number(event.target.value) })}><option value="1">{t("user.status.enabled")}</option><option value="0">{t("user.status.disabled")}</option></Select></Field>
          {canProfileUpdate && <Field label={t("user.field.memberGroup")}><Select value={editing.groupId} onChange={(event) => setEditing({ ...editing, groupId: event.target.value })}><option value="">{t("user.ungrouped")}</option>{(groups.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></Field>}
        </form>}
      </Drawer>

      <Drawer open={levelOpen} onClose={() => setLevelOpen(false)} title={t("detail.level.title")} description={t("detail.level.drawerDescription")} footer={<><Button variant="ghost" onClick={() => setLevelOpen(false)}>{t("user.cancel")}</Button><Button disabled={!levelId || levelMutation.isPending} onClick={() => levelMutation.mutate(levelId)}>{levelMutation.isPending ? t("user.submitting") : t("detail.level.confirm")}</Button></>}>
        <div className="space-y-4">
          {actionError && <ErrorLine text={actionError} />}
          <Field label={t("detail.level.target")}><Select value={levelId} onChange={(event) => setLevelId(event.target.value)}><option value="">{t("detail.level.placeholder")}</option>{(levels.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></Field>
        </div>
      </Drawer>

      <Drawer open={pointOpen} onClose={() => setPointOpen(false)} title={t("user.action.adjustPoint")} description={t("user.point.description")} footer={<><Button variant="ghost" onClick={() => setPointOpen(false)}>{t("user.cancel")}</Button><Button disabled={pointMutation.isPending || pointDelta === 0} onClick={() => pointMutation.mutate(pointDelta)}>{pointMutation.isPending ? t("user.processing") : t("user.point.confirm")}</Button></>}>
        <div className="space-y-4">
          {actionError && <ErrorLine text={actionError} />}
          <div className="rounded-2xl bg-[var(--hero)] p-5 text-white">
            <div className="text-xs text-white/45">{t("user.point.current")}</div>
            <div className="mt-2 text-2xl font-semibold">{growth?.point ?? 0}</div>
            <div className="mt-4 text-xs text-[var(--primary)]">{t("user.point.after", { value: (growth?.point ?? 0) + pointDelta })}</div>
          </div>
          <Field label={t("user.point.deltaLabel")}><Input type="number" value={pointDelta} onChange={(event) => setPointDelta(Number(event.target.value))} /></Field>
        </div>
      </Drawer>

      <Drawer open={Boolean(walletForm)} onClose={() => setWalletForm(null)} title={t("detail.action.adjustBalance")} description={t("detail.wallet.description")} footer={<><Button variant="ghost" onClick={() => setWalletForm(null)}>{t("user.cancel")}</Button><Button disabled={walletMutation.isPending || !walletForm || walletForm.amount === 0 || (walletForm.mode !== "balance" && !walletForm.remark.trim())} onClick={() => walletForm && walletMutation.mutate(walletForm)}>{walletMutation.isPending ? t("user.processing") : t("detail.wallet.confirm")}</Button></>}>
        {walletForm && <div className="space-y-4">
          {actionError && <ErrorLine text={actionError} />}
          <div className="rounded-2xl bg-[var(--hero)] p-5 text-white">
            <div className="text-xs text-white/45">{t("detail.wallet.currentBalance")}</div>
            <div className="mt-2 text-2xl font-semibold">{money(wallet.data?.balance ?? 0)}</div>
            <div className="mt-4 text-xs text-white/45">{t("detail.wallet.totals", { recharge: money(wallet.data?.totalRecharge ?? 0), expense: money(wallet.data?.totalExpense ?? 0) })}</div>
          </div>
          <Field label={t("detail.wallet.mode")}><Select value={walletForm.mode} onChange={(event) => setWalletForm({ ...walletForm, mode: event.target.value as "balance" | "recharge" | "deduct" })}><option value="recharge">{t("detail.wallet.mode.recharge")}</option><option value="deduct">{t("detail.wallet.mode.deduct")}</option><option value="balance">{t("detail.wallet.mode.balance")}</option></Select></Field>
          <Field label={t("detail.wallet.amount")}><Input type="number" value={walletForm.amount} onChange={(event) => setWalletForm({ ...walletForm, amount: Number(event.target.value) })} /></Field>
          <p className="text-[11px] text-[var(--muted-foreground)]">= {money(walletForm.amount || 0)}</p>
          {walletForm.mode !== "balance" && <Field label={t("detail.wallet.remark")}><Textarea value={walletForm.remark} onChange={(event) => setWalletForm({ ...walletForm, remark: event.target.value })} /></Field>}
        </div>}
      </Drawer>

      <Drawer open={passwordOpen} onClose={closePassword} title={t("user.action.resetPassword")} description={t("detail.password.description")} footer={<><Button variant="ghost" onClick={closePassword}>{t("user.cancel")}</Button><Button disabled={passwordMutation.isPending || password.length < 8 || password !== passwordAgain} onClick={() => passwordMutation.mutate(password)}>{passwordMutation.isPending ? t("user.submitting") : t("user.password.confirm")}</Button></>}>
        <div className="space-y-4">
          {actionError && <ErrorLine text={actionError} />}
          <Field label={t("user.password.new")}><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("user.password.newPlaceholder")} /></Field>
          <Field label={t("user.password.again")}><Input type="password" autoComplete="new-password" value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} placeholder={t("user.password.againPlaceholder")} /></Field>
          {password.length > 0 && password.length < 8 && <p className="text-xs text-red-600">{t("user.password.tooShort")}</p>}
          {passwordAgain.length > 0 && password !== passwordAgain && <p className="text-xs text-red-600">{t("user.password.mismatch")}</p>}
          <p className="text-[11px] text-[var(--muted-foreground)]">{t("user.password.hint")}</p>
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
