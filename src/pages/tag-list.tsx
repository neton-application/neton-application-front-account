"use client";
import { ResourcePage } from "@neton/application-front-resource";
export default function Page() { return <ResourcePage config={{ resourceKey: "member-tag", eyebrow: "MEMBER SEGMENT", title: "会员标签", description: "维护轻量、可复用的会员标签。", endpoint: "/member/tag", permissions: { page: "member:tag:query", create: "member:tag:create", update: "member:tag:update", delete: "member:tag:delete" }, fields: [{ key: "name", label: "标签名称", required: true }, { key: "createdAt", label: "创建时间", format: "date" }, { key: "name", label: "标签名称", filter: true, table: false }] }} />; }
