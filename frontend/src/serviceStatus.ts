 
export function serviceStatus(value?: string): string {
  const labels: Record<string, string> = {
    online: '运行正常', offline: '暂不可用', configured: '已配置',
    'local-json': '本机存储', mysql: '数据库存储', mock: '演示解读',
    completed: '已完成', running: '处理中', failed: '失败', pending: '待处理',
    cancelled: '已取消', descriptive: '描述统计', groupby: '分组聚合',
    correlation: '相关性分析', clean: '数据清洗',
  };
  return value ? labels[value] || '状态待确认' : '检测中';
}
