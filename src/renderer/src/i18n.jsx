import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Language and theme preferences. The English text itself is the translation key, so a missing
// Chinese entry simply shows the English. `{name}` placeholders are filled from the second argument.
const ZH = {
  // Header / preferences
  'Leasing Management': '租赁管理',
  'Light': '浅色',
  'Dark': '深色',
  'Switch to dark mode': '切换到深色模式',
  'Switch to light mode': '切换到浅色模式',
  'Switch to Chinese': '切换为中文',
  'Switch to English': '切换为英文',
  // Tabs / pages
  'Properties': '房产',
  'Tenants': '租客',
  'Admin': '管理',
  'Properties Overview': '房产总览',
  '← Properties Overview': '← 房产总览',
  'Properties {year}': '{year} 年房产',
  'Select a year': '选择年份',
  'No years yet': '暂无年份',
  'Select another year': '选择其他年份',
  '+ Add Property': '+ 添加房产',
  '+ Add Property…': '+ 添加房产…',
  'Copy from year…': '从其他年份复制…',
  'No other year to copy from': '没有其他年份可复制',
  'No properties yet. Click "Add Property" to create one.': '暂无房产。点击“添加房产”创建。',
  'No properties yet. Click "Add Property…" to add one to this year.': '本年度暂无房产。点击“添加房产…”添加。',
  // Table headers
  'Address': '地址', 'City': '城市', 'State': '州', 'Zip': '邮编', 'Beds': '卧室', 'Baths': '卫生间',
  'Sq ft': '面积（平方英尺）', 'Purchase Date': '购买日期', 'Actions': '操作',
  'Rent / yr': '年租金', 'Mortgage / mo': '月房贷', 'Mortgage Interest / yr': '年房贷利息', 'HOA / yr': '年物业费',
  'Tax / yr': '年房产税', 'Insurance / yr': '年保险', 'Repairs': '维修', 'Net / yr': '年净收入',
  'Annual totals': '年度合计',
  'Edit': '编辑', 'Delete': '删除', 'Manage Lease': '管理租约', 'Show on map': '在地图上显示',
  'Show {address} on map': '在地图上显示 {address}',
  'Delete {address}, {city}?': '删除 {address}，{city}？',
  // Summary
  'Yearly Summary': '年度汇总',
  'Yearly rent income': '年租金收入',
  'Yearly expenses (mortgage interest, HOA, tax, insurance, repairs)': '年支出（房贷利息、物业费、房产税、保险、维修）',
  'Net income (yearly)': '净收入（年）',
  // Admin
  'Years': '年份', 'Years already added:': '已添加的年份：', 'No years yet.': '暂无年份。',
  'Add a year': '添加年份', 'Add year': '添加', '{year} is already added': '{year} 已添加',
  'Year {year} added.': '已添加 {year} 年。',
  // Common buttons
  'Save': '保存', 'Cancel': '取消', 'Close': '关闭', 'Confirm': '确认', 'Back': '返回', 'Loading…': '加载中…',
  'Saved.': '已保存。', 'Property saved.': '房产已保存。',
  // Property form
  'Edit Property': '编辑房产', 'Add Property': '添加房产', 'Edit House': '编辑房产', 'Add House': '添加房产',
  'Bedrooms': '卧室', 'Bathrooms': '卫生间', 'Purchase date': '购买日期',
  'Yearly rent ($)': '年租金（$）', 'Monthly mortgage ($)': '月房贷（$）', 'Yearly HOA fee ($)': '年物业费（$）',
  'Property tax ($/year)': '房产税（$/年）', 'Optional costs (leave blank if not applicable)': '可选费用（不适用请留空）',
  'Insurance ($/year)': '保险（$/年）', 'Mortgage interest ($/year)': '房贷利息（$/年）',
  'Total repair cost: {total}': '维修费用合计：{total}',
  'Date': '日期', 'Amount ($)': '金额（$）', 'Contractor': '承包商', 'Description': '说明',
  'Repair date': '维修日期', 'Repair amount': '维修金额', 'Repair description': '维修说明',
  'Remove item': '删除此项', 'Remove repair item': '删除维修项', '+ Add repair': '+ 添加维修',
  // Add / copy to year
  'Add properties to this year': '添加房产到本年度', 'Select all': '全选',
  'No properties available for {year}. Only properties with a purchase date in or before {year} that aren\'t already in this year are listed. Add new properties or set purchase dates from the Home screen.':
    '{year} 年没有可添加的房产。仅列出购买日期不晚于 {year} 年且尚未加入本年度的房产。请在主页添加新房产或设置购买日期。',
  '{address}, {city} (purchased {date})': '{address}，{city}（购买于 {date}）',
  'Add': '添加', 'Add ({n})': '添加（{n}）',
  'Copy houses from another year': '从其他年份复制房产', 'Copy from': '复制自',
  'Only address and property details are copied, not rent, costs or other amounts.': '仅复制地址和房产信息，不含租金、费用或其他金额。',
  'No houses in {year}.': '{year} 年没有房产。',
  'date unknown': '日期未知', ' - already in this year': ' - 已在本年度', ' - not available for {year}': ' - {year} 年不可用',
  'Copy': '复制', 'Copy ({n})': '复制（{n}）',
  // Map
  'Map of {address}': '{address} 的地图',
  // Tenants page
  '{n} tenants': '{n} 位租客', '1 tenant': '1 位租客', 'Show SSNs': '显示社保号', 'Hide SSNs': '隐藏社保号',
  'No tenants yet. Tenants are added from a property\'s lease.': '暂无租客。租客需在房产的租约中添加。',
  'First name': '名', 'Last name': '姓', 'Gender': '性别', 'SSN': '社保号', 'Date of birth': '出生日期',
  'Phone': '电话', 'Email': '邮箱', 'Active lease': '当前租约', 'SSN (masked)': '社保号（已隐藏）',
  'Male': '男', 'Female': '女', 'Other': '其他',
  'Leasing history': '租赁历史', 'Leasing history of {name}': '{name} 的租赁历史',
  'Leasing history — {name}': '租赁历史 — {name}',
  'This tenant has not been on any lease.': '该租客没有任何租约记录。', 'Term': '租期', 'Rent ($/mo)': '月租金（$）', 'Monthly rent ($)': '月租金（$）',
  'Pick a tenant': '选择租客', 'Name contains': '姓名包含', 'Type part of a tenant name.': '请输入租客姓名的一部分。',
  'No matching tenants.': '没有匹配的租客。', 'Add selected': '添加所选',
  '{start} to {end}': '{start} 至 {end}',
  // Manage lease
  'Manage Lease — {address}': '管理租约 — {address}',
  'Leasing contracts ({n}) — saved as soon as you confirm': '租赁合同（{n}）— 确认后立即保存',
  'Start': '开始', 'End': '结束', 'Move in': '入住', 'Move out': '搬出', 'Agreement': '协议',
  'Renew': '续租', 'Add a follow-on lease starting the day after this one ends': '添加下一份租约，从本租约结束次日开始',
  'Edit lease': '编辑租约', 'Delete lease': '删除租约', '+ Add lease': '+ 添加租约',
  'Delete the lease {start} to {end}?': '删除租约 {start} 至 {end}？',
  'Lease added.': '租约已添加。', 'Lease saved.': '租约已保存。', 'Lease deleted.': '租约已删除。', 'Tenant added.': '租客已添加。',
  'Upload…': '上传…', 'Upload the signed residential lease agreement': '上传已签署的住宅租赁协议',
  'View': '查看', 'Open in your default app': '用默认应用打开', 'Download': '下载', 'Save a copy': '保存副本',
  'Replace': '替换', 'Replace with another file': '用其他文件替换', 'Remove agreement': '删除协议',
  'Remove the agreement "{name}" from this lease?': '从此租约中删除协议“{name}”？',
  'Agreement uploaded.': '协议已上传。', 'Agreement saved.': '协议已保存。', 'Agreement removed.': '协议已删除。',
  'Leasing Documents': '租赁文件', 'No documents yet.': '暂无文件。', '+ Upload document': '+ 上传文件',
  'Save the lease first, then edit it to attach documents.': '请先保存租约，然后编辑租约以添加文件。',
  'Remove document': '删除文件', 'Remove the document "{name}" from this lease?': '从此租约中删除文件“{name}”？',
  'Document uploaded.': '文件已上传。', 'Document replaced.': '文件已替换。',
  'Document saved.': '文件已保存。', 'Document removed.': '文件已删除。',
  'Action': '操作', 'Download Documents': '下载文件', 'Documents saved.': '文件已保存。',
  'Download all lease documents as a zip file': '将所有租赁文件下载为 zip 压缩包', 'This lease has no documents.': '此租约没有文件。',
  'Leasing Document Types': '租赁文件类型', 'Document type name': '文件类型名称', 'Add type': '添加类型',
  'No document types yet.': '暂无文件类型。', 'Edit type': '编辑类型', 'Delete type': '删除类型',
  'Delete the document type "{name}"?': '删除文件类型“{name}”？', 'Document type added.': '文件类型已添加。',
  'Document type saved.': '文件类型已保存。', 'Document type deleted.': '文件类型已删除。',
  'That document type already exists.': '该文件类型已存在。', 'Enter a document type name.': '请输入文件类型名称。',
  'Select a document type': '选择文件类型', 'Choose…': '请选择…', 'Choose file…': '选择文件…', 'No type': '无类型',
  'No document types — add some in Admin': '没有文件类型 — 请先在“管理”中添加', 'Choose a document type.': '请选择文件类型。',
  'File name': '文件名', 'Document type': '文件类型',
  "Driver's license": '驾照', 'License number': '驾照号码', 'Issuing state': '签发州',
  'Issue date': '签发日期', 'Expiration date': '到期日期',
  'Edit Tenant': '编辑租客', 'Edit tenant': '编辑租客', 'Tenant saved.': '租客已保存。',
  'Has a lease': '有租约', 'Has a lease (past, current or future) — keep this tenant': '有租约（过去、当前或未来）— 请保留此租客',
  'Lease status': '租约状态', 'Tenant deleted.': '租客已删除。',
  'Delete the tenant "{name}"? This cannot be undone.': '删除租客“{name}”？此操作无法撤销。',
  'Not on any lease — click to delete this tenant': '没有任何租约 — 点击删除此租客', 'Delete tenant {name}': '删除租客 {name}',
  // Lease dialog
  'Add Lease': '添加租约', 'Renew Lease': '续租', 'Net': '净收入', 'Rent': '租金', 'HOA': '物业费', 'Mortgage interest': '房贷利息', 'Tax': '房产税', 'Insurance': '保险', 'Total': '合计', 'Calculate from leases': '按租约计算', 'Rent by month': '按月租金', 'Monthly rent from the leases covering {year}': '{year} 年内租约覆盖的每月租金', 'Apply calculated amount': '应用计算结果', 'Jan': '1月', 'Feb': '2月', 'Mar': '3月', 'Apr': '4月', 'May': '5月', 'Jun': '6月', 'Jul': '7月', 'Aug': '8月', 'Sep': '9月', 'Oct': '10月', 'Nov': '11月', 'Dec': '12月', 'Status': '状态', 'Vacant': '空置', 'Vacant: not covered by a lease': '空置：当前没有租约', 'Lease ends in {n} days': '租约将在 {n} 天后到期', 'Lease ending soon': '租约即将到期', 'Lease Terms': '租约条款', 'Edit Lease': '编辑租约',
  'Fill in the lease and add its tenants, then confirm to save it.': '填写租约并添加租客，然后点击确认保存。',
  'Review or edit the new lease, then confirm to save it.': '检查或修改新租约，然后点击确认保存。',
  'Change the lease, then confirm to save it.': '修改租约，然后点击确认保存。',
  'Start date': '开始日期', 'End date': '结束日期',
  'Tenants (tick those occupying)': '租客（勾选实际居住者）', 'No tenants on this lease yet.': '此租约尚无租客。',
  'Remove from this lease': '从此租约中移除', 'Remove {name} from this lease': '将 {name} 从此租约中移除',
  '+ Add tenant': '+ 添加租客',
  'Start and end dates are required.': '开始和结束日期为必填项。',
  'End date cannot be before the start date.': '结束日期不能早于开始日期。',
  'Monthly rent must be a number, 0 or greater.': '月租金必须是不小于 0 的数字。',
  'Move-out date cannot be before the move-in date.': '搬出日期不能早于入住日期。',
  // Tenant dialog
  'Add Tenant': '添加租客', 'Save tenant': '保存租客', 'Existing tenant?': '已有租客？',
  'Yes, use this person': '是，使用此人', 'No, add as a new person': '否，添加为新租客',
  'No phone or email': '无电话或邮箱', 'Are you adding an existing person?': '您是要添加已有的人员吗？',
  'The SSN is already in use, so it can\'t be added as a new person.': '该社保号已被使用，不能添加为新租客。',
  'SSN matches': '社保号', 'phone': '电话', 'email': '邮箱',
  'The {fields} you entered matches {these} already in the database.': '您输入的{fields}与数据库中{these}相同。',
  'these tenants': '这些租客', 'this tenant': '该租客', 'matches on {fields}': '匹配项：{fields}'
};

const LangContext = createContext(null);

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // preferences just won't persist
  }
};

/** Provides the language (en | zh) and theme (light | dark); both default to the first and persist. */
export function PrefsProvider({ children }) {
  const [lang, setLang] = useState(() => (read('lm.lang', 'en') === 'zh' ? 'zh' : 'en'));
  const [theme, setTheme] = useState(() => (read('lm.theme', 'light') === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write('lm.theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    write('lm.lang', lang);
  }, [lang]);

  const t = useCallback((text, vars) => {
    let out = lang === 'zh' && ZH[text] !== undefined ? ZH[text] : text;
    if (vars) {
      out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    }
    return out;
  }, [lang]);

  const value = useMemo(() => ({
    lang, theme, t,
    toggleLang: () => setLang((l) => (l === 'en' ? 'zh' : 'en')),
    toggleTheme: () => setTheme((x) => (x === 'light' ? 'dark' : 'light'))
  }), [lang, theme, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const usePrefs = () => useContext(LangContext);
/** Translate: `const t = useT(); t('Save')`, `t('Year {year} added.', { year })`. */
export const useT = () => useContext(LangContext).t;
