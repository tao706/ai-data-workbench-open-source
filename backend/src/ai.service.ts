import { ChatOpenAI } from '@langchain/openai';

type Plan = { type: 'descriptive' | 'groupby' | 'correlation'; dimension?: string };

export function modelMode() {
  return process.env.OPENAI_API_KEY ? 'langchain' : 'mock';
}

export async function streamExplanation(input: {
  question: string;
  dataset: { name: string; rows: number; columns: number };
  plan: Plan;
  result: any;
  sendToken: (text: string) => void;
  isClosed: () => boolean;
}) {
  const { question, dataset, plan, result, sendToken, isClosed } = input;
  if (process.env.OPENAI_API_KEY) {
    const model = new ChatOpenAI({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      configuration: process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : undefined,
      temperature: 0,
      timeout: 30000,
      maxRetries: 1,
    });
    const stream = await model.stream([
      { role: 'system', content: '你是数据分析助手。只能基于提供的JSON数据作答。必须注明数据集名和计算依据，无法判断的原因要明确说明。不要编造数字。' },
      { role: 'user', content: `问题：${question}\n数据集：${dataset.name}\n计算结果：${JSON.stringify(result).slice(0, 18000)}` },
    ]);
    let answer = '';
    for await (const chunk of stream) {
      if (isClosed()) break;
      const token = typeof chunk.content === 'string' ? chunk.content : '';
      answer += token;
      if (token) sendToken(token);
    }
    return answer;
  }

  const summary = plan.type === 'groupby'
    ? `按“${plan.dimension}”分组，结果为：${result.categories.map((x: string, i: number) => `${x} ${result.series[i]}`).join('；')}。`
    : plan.type === 'correlation'
      ? `数值字段为 ${result.fields.join('、')}，相关系数矩阵：${JSON.stringify(result.matrix)}。`
      : `数据集共 ${dataset.rows} 行、${dataset.columns} 列，重复行 ${result.duplicates} 条。数值字段统计：${Object.entries(result.numeric as Record<string, { mean: number; median: number }>).map(([k, v]) => `${k} 平均值 ${Number(v.mean).toFixed(2)}，中位数 ${Number(v.median).toFixed(2)}`).join('；')}。`;
  const answer = `基于数据集「${dataset.name}」的实际计算结果：\n\n${summary}\n\n这回答展示可核对的统计值。若需进一步解释原因，请结合业务背景和更多字段。`;
  for (const part of answer.match(/.{1,12}/gs) || []) {
    if (isClosed()) break;
    sendToken(part);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return answer;
}
