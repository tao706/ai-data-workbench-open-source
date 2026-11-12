export const scientificPalette = [
  { name: '晴空蓝', color: '#5B7FB9' },
  { name: '玫瑰粉', color: '#E1829D' },
  { name: '雾蓝', color: '#8CB3D9' },
  { name: '柔粉', color: '#F4A7B9' },
  { name: '浅蓝', color: '#BFD7EA' },
  { name: '浅樱粉', color: '#FADADD' },
];

export function themeColor(color: string): string {
  const previous: Record<string,string> = {
    '#607595':'#5B7FB9','#8898b4':'#8CB3D9','#9fbad3':'#8CB3D9',
    '#bbd2e2':'#BFD7EA','#e9d1db':'#FADADD','#d4adba':'#F4A7B9',
    '#d19cb6':'#E1829D','#a68095':'#E1829D','#9a5265':'#5B7FB9',
    '#4f7cff':'#5B7FB9','#526ef2':'#5B7FB9','#5674f5':'#5B7FB9',
    '#ef8e97':'#E1829D','#aacfd5':'#8CB3D9','#f8b4b5':'#F4A7B9',
    '#fbeede':'#BFD7EA','#feede5':'#FADADD','#456398':'#5B7FB9',
  };
  return previous[color.toLowerCase()] || color;
}

 
export function categoryPalette(count: number, primary: string): string[] {
  const normalize = (value: string) => value.toUpperCase();
  const pastel = (value: string) => {
    if (!/^#[\da-f]{6}$/i.test(value)) return '#BFD7EA';
    const channels = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
    const average = channels.reduce((sum, channel) => sum + channel, 0) / 3;
    const darkest = Math.min(...channels);
    const white = Math.max(0, Math.min(.55, (215 - average) / 115), (170 - darkest) / (255 - darkest));
    return '#' + channels.map(channel => Math.round(channel + (255 - channel) * white).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const selected = [...new Set([primary, ...scientificPalette.map(item => item.color)].map(pastel).map(normalize))].slice(0, count);
  const rgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const hsl = (hue: number, saturation: number, lightness: number) => {
    const s = saturation / 100, l = lightness / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => { const k = (n + hue / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return '#' + [f(0), f(8), f(4)].map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const pool = new Set<string>();
  for (const hue of [200, 206, 212, 218, 224, 230, 328, 334, 340, 346, 352, 358])
    for (const saturation of [30, 42, 54])
      for (const lightness of [78, 82, 86, 90]) pool.add(hsl(hue, saturation, lightness));
  selected.forEach(value => pool.delete(value));
  const distance = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
  while (selected.length < count && pool.size) {
    const used = selected.map(rgb);
    let best = '', score = -1;
    for (const candidate of pool) {
      const candidateRgb = rgb(candidate);
      const separation = Math.min(...used.map(value => distance(value, candidateRgb)));
      if (separation > score) { best = candidate; score = separation; }
    }
    selected.push(best); pool.delete(best);
  }
  return selected;
}
