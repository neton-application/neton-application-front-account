"use client";
import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useMutation, usePermission, useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import { Button, Field, Input, PageHeader, Select } from "@neton/application-front-kit";

interface Config { pointTradeDeductEnable: number; pointTradeDeductUnitPrice: number; pointTradeDeductMaxPrice: number; pointTradeGivePoint: number }

export default function MemberConfigPage() {
  const client = useQueryClient();
  const canUpdate = usePermission("member:config:update");
  const query = useQuery({ queryKey: ["member-config"], queryFn: () => apiFetch<Config>("/admin/member/config/get") });
  const [form, setForm] = React.useState<Config | null>(null);
  React.useEffect(() => { if (query.data) setForm(query.data); }, [query.data]);
  const mutation = useMutation({ mutationFn: (value: Config) => apiWrite<void>("/admin/member/config/update", "PUT", value), onSuccess: async () => client.invalidateQueries({ queryKey: ["member-config"] }) });
  return <div className="space-y-4">
    <PageHeader eyebrow="LOYALTY POLICY" title="会员配置" description="维护积分抵扣与赠送规则。金额字段沿用服务端最小货币单位，避免浮点误差。" actions={<Button variant="outline" onClick={() => query.refetch()}>刷新</Button>} />
    <section className="max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      {query.isPending || !form ? <div className="text-sm text-[var(--muted-foreground)]">正在加载配置…</div> : <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); mutation.mutate(form); }}>
        <Field label="积分抵扣"><Select value={form.pointTradeDeductEnable} onChange={(event) => setForm({ ...form, pointTradeDeductEnable: Number(event.target.value) })}><option value="1">启用</option><option value="0">停用</option></Select></Field>
        <Field label="每积分抵扣单价"><Input type="number" min={0} value={form.pointTradeDeductUnitPrice} onChange={(event) => setForm({ ...form, pointTradeDeductUnitPrice: Number(event.target.value) })} /></Field>
        <Field label="单笔最大抵扣"><Input type="number" min={0} value={form.pointTradeDeductMaxPrice} onChange={(event) => setForm({ ...form, pointTradeDeductMaxPrice: Number(event.target.value) })} /></Field>
        <Field label="消费赠送积分"><Input type="number" min={0} value={form.pointTradeGivePoint} onChange={(event) => setForm({ ...form, pointTradeGivePoint: Number(event.target.value) })} /></Field>
        <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={!canUpdate || mutation.isPending}>{mutation.isPending ? "保存中…" : "保存配置"}</Button></div>
      </form>}
    </section>
  </div>;
}
