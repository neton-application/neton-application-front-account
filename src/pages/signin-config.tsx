"use client";
import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useMutation, usePermission, useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import { Button, Drawer, Field, Input, Select } from "@neton/application-front-kit";

/** 与后端 SettingValueType 序号对齐：0 文本 1 整数 2 长整数 3 布尔 4 定点数 5 JSON */
const TYPE_INT = 1, TYPE_LONG = 2, TYPE_BOOLEAN = 3;
interface Setting { category:string; key:string; value:string; valueType:number; name:string; description:string; defaultValue:string; isDefault:boolean }

/**
 * 签到的全局设置（周期长度、是否循环）。
 *
 * 存在 system_settings 里，和系统设置页是同一批数据，但走签到自己的端点：那边要
 * system:setting:*（超管），这边要 member:signin:*（运营）。可见范围由后端按
 * member.signin. 前缀限定，不在前端过滤 —— 前端过滤只是少显示几项，直接调接口
 * 照样能改别的。
 */
function GlobalSetting() {
  const client = useQueryClient();
  const canUpdate = usePermission("member:signin:update");
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const query = useQuery({ queryKey: ["member-signin-setting"], queryFn: () => apiFetch<Setting[]>("/admin/member/sign-in/setting/list"), enabled: open });
  const items = query.data ?? [];
  React.useEffect(() => { if (query.data) setValues(Object.fromEntries(query.data.map((it) => [it.key, it.value]))); }, [query.data]);

  const save = useMutation({
    // 只提交改过的：重写未改动的值会把 isDefault 抹掉，而「有没有人动过这个设置」
    // 是奖励发错时第一个要看的线索
    mutationFn: async () => {
      const changed = items.filter((it) => values[it.key] !== it.value);
      for (const it of changed) await apiWrite<void>("/admin/member/sign-in/setting/update", "POST", { key: it.key, value: String(values[it.key]).trim() });
      return changed.length;
    },
    onSuccess: async () => { setOpen(false); setError(null); await client.invalidateQueries({ queryKey: ["member-signin-setting"] }); },
    onError: (cause: Error) => setError(cause.message),
  });

  if (!canUpdate) return null;
  return <>
    <Button variant="outline" onClick={() => { setError(null); setOpen(true); }}>全局设置</Button>
    <Drawer open={open} onClose={() => setOpen(false)} title="签到全局设置" description="周期长度决定「第几天」的合法范围；改小之后超出范围的配置将无法命中。" widthClassName="max-w-xl"
      footer={<><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button disabled={save.isPending || query.isPending} onClick={() => save.mutate()}>{save.isPending ? "保存中…" : "保存"}</Button></>}>
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      {query.isPending ? <p className="text-sm text-[var(--muted-foreground)]">加载中…</p>
        : items.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">没有可调整的签到设置</p>
        : <div className="space-y-4">{items.map((it) => <div key={it.key} className="space-y-1">
            <Field label={it.name}>
              {it.valueType === TYPE_BOOLEAN
                ? <Select value={values[it.key] ?? it.value} onChange={(e) => setValues({ ...values, [it.key]: e.target.value })}><option value="true">开启</option><option value="false">关闭</option></Select>
                : <Input type={it.valueType === TYPE_INT || it.valueType === TYPE_LONG ? "number" : "text"} value={values[it.key] ?? it.value} onChange={(e) => setValues({ ...values, [it.key]: e.target.value })} />}
            </Field>
            <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">{it.description}<span className="ml-1 opacity-70">（默认：{it.defaultValue}）</span>
              {values[it.key] !== it.defaultValue && <button type="button" className="ml-2 underline" onClick={() => setValues({ ...values, [it.key]: it.defaultValue })}>恢复默认</button>}</p>
          </div>)}</div>}
    </Drawer>
  </>;
}

export default function Page() {
  return <ResourcePage config={{ resourceKey: "member-signin-config", eyebrow: "DAILY REWARD", title: "签到配置", description: "配置连续签到天数对应的积分、经验与现金奖励。现金单位为分。", endpoint: "/member/sign-in/config", listPath: "list-all", permissions: { page: "member:signin:query", create: "member:signin:create", update: "member:signin:update", delete: "member:signin:delete" }, headerActions: <GlobalSetting />, fields: [{ key: "day", label: "连续天数", type: "number", defaultValue: 1, required: true }, { key: "point", label: "积分", type: "number", defaultValue: 0 }, { key: "experience", label: "经验", type: "number", defaultValue: 0 }, { key: "cashAmount", label: "现金奖励(分)", type: "number", defaultValue: 0 }, { key: "status", label: "状态", type: "select", defaultValue: 1, format: "status", options: [{ label: "启用", value: 1 }, { label: "停用", value: 0 }] }] }} />;
}
