// ============================================================
// 🍬 糖果球的手繪風外觀：扁平色塊＋深咖啡外框＋24 種表情（每個顏色一種，不會重複）
//  - 白板賽道、孩子選球、中場預言、結果頒獎台都用這裡的畫法
// ============================================================
export const LINE = '#5b4038';

const dot = (x, y, r = 1.6) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + LINE + '"/>';
const arc = (x, y, up) => '<path d="M' + (x - 2.2) + ' ' + y + ' Q' + x + ' ' + (y + (up ? -2.4 : 2.4)) + ' ' + (x + 2.2) + ' ' + y + '" stroke="' + LINE + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
const stroke = d => '<path d="' + d + '" stroke="' + LINE + '" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
const smile = stroke('M-2.2 4.4 Q0 6.6 2.2 4.4');
const blush = '<circle cx="-7.5" cy="4" r="2" fill="#f28da6" opacity=".7"/><circle cx="7.5" cy="4" r="2" fill="#f28da6" opacity=".7"/>';
const bigBlush = '<ellipse cx="-7.5" cy="4.2" rx="2.8" ry="2" fill="#f28da6" opacity=".8"/><ellipse cx="7.5" cy="4.2" rx="2.8" ry="2" fill="#f28da6" opacity=".8"/>';
const star = x => '<path transform="translate(' + x + ' 1)" d="M0 -2.6 L.8 -.8 L2.6 -.8 L1.2 .4 L1.7 2.3 L0 1.2 L-1.7 2.3 L-1.2 .4 L-2.6 -.8 L-.8 -.8Z" fill="#ffd34d" stroke="' + LINE + '" stroke-width=".7"/>';
const heart = x => '<path transform="translate(' + x + ' 1)" d="M0 2 C-3 0 -2.6 -2.4 -1.2 -2.4 C-.5 -2.4 0 -1.8 0 -1.4 C0 -1.8 .5 -2.4 1.2 -2.4 C2.6 -2.4 3 0 0 2Z" fill="#f2557a"/>';

/* 24 種表情（座標以球心為 0,0，球半徑 13） */
export const FACES = [
  dot(-4, 1) + dot(4, 1) + smile + blush,                                                                   // 微笑
  arc(-4, 1.5, true) + arc(4, 1.5, true) + '<path d="M-3 3.6 Q0 8.2 3 3.6Z" fill="' + LINE + '"/>' + blush,   // 開心大笑
  dot(-4, 1) + stroke('M2 1 H6') + smile + blush,                                                          // 眨眼
  stroke('M-6 -.5 L-3 1 L-6 2.5 M6 -.5 L3 1 L6 2.5') + stroke('M-2.2 4.2 Q0 6 2.2 4.2') + blush,             // >< 超用力
  arc(-4, 1, false) + arc(4, 1, false) + smile + blush,                                                    // 瞇瞇眼
  dot(-4, 0) + dot(4, 0) + '<ellipse cx="0" cy="5" rx="1.8" ry="2.2" fill="' + LINE + '"/>' + blush,         // 驚訝
  arc(-4, 1.5, true) + arc(4, 1.5, true) + stroke('M-2.4 4 Q0 6 2.4 4') + '<path d="M-.2 5 Q1.2 8.6 2.4 5.2" fill="#f28da6" stroke="' + LINE + '" stroke-width="1"/>' + blush,  // 吐舌頭
  star(-4) + star(4) + smile,                                                                              // 星星眼
  heart(-4) + heart(4) + smile,                                                                            // 愛心眼
  stroke('M-6 -2 L-2.5 -1 M6 -2 L2.5 -1') + dot(-4, 1) + dot(4, 1) + stroke('M-2 5 H2'),                   // 認真臉
  stroke('M-6 1 H-2 M2 1 H6') + '<text x="7" y="-4" font-size="5" font-weight="700" fill="' + LINE + '">z</text><text x="10" y="-8" font-size="4" font-weight="700" fill="' + LINE + '">z</text>' + stroke('M-1.5 5 Q0 6 1.5 5') + blush,  // 睡覺
  dot(-4, 1) + dot(4, 1) + stroke('M-2.2 6 Q0 4 2.2 6') + '<path d="M5 3 Q4 6 5.5 7 Q7 6 5 3Z" fill="#8ec9ff" stroke="' + LINE + '" stroke-width=".8"/>',  // 哭哭
  stroke('M-6 1 Q-4 -.6 -2 1') + dot(4, 1) + stroke('M-1 5 Q2 6.2 3.5 3.6') + blush,                         // 得意
  stroke('M-6 0 L-3 1.6 L-6 3 M6 0 L3 1.6 L6 3') + stroke('M-1.4 5.2 Q0 4.2 1.4 5.2') + bigBlush,            // 害羞
  stroke('M-6.5 -2.5 L-2 -.5 M6.5 -2.5 L2 -.5') + dot(-4, 1.5) + dot(4, 1.5) + stroke('M-2.4 6 Q0 4.4 2.4 6'),  // 生氣
  dot(-4, 1) + dot(4, 1) + stroke('M-1 3.6 Q1.6 4.6 -1 5.4 Q1.6 6.4 -1 7.2') + blush,                        // 嘟嘴
  arc(-4, 1.5, true) + arc(4, 1.5, true) + stroke('M-3 4.2 Q-1.5 6 0 4.2 Q1.5 6 3 4.2') + blush,             // ω 貓咪嘴
  '<path d="M-8 -1 H8 V1.6 Q8 4 5 4 Q2.6 4 2 1.6 H-2 Q-2.6 4 -5 4 Q-8 4 -8 1.6Z" fill="' + LINE + '"/>' + stroke('M-2 6.2 Q0 7.4 2 6.2'),  // 墨鏡
  '<circle cx="-4" cy="1" r="2.4" fill="none" stroke="' + LINE + '" stroke-width="1.2"/><circle cx="-4" cy="1" r=".9" fill="' + LINE + '"/><circle cx="4" cy="1" r="2.4" fill="none" stroke="' + LINE + '" stroke-width="1.2"/><circle cx="4" cy="1" r=".9" fill="' + LINE + '"/>' + stroke('M-2.4 6 Q-1.2 5 0 6 Q1.2 7 2.4 6'),  // 暈暈
  arc(-4, 1.5, true) + arc(4, 1.5, true) + stroke('M-3 4 Q-1.5 5.6 0 4.4 Q1.5 5.6 3 4') + blush,             // 偷笑
  '<circle cx="-4" cy="1" r="2.3" fill="#fff" stroke="' + LINE + '" stroke-width="1.1"/>' + dot(-3.6, 1.4, 1.1) + '<circle cx="4" cy="1" r="2.3" fill="#fff" stroke="' + LINE + '" stroke-width="1.1"/>' + dot(4.4, 1.4, 1.1) + '<ellipse cx="0" cy="6" rx="1.2" ry="1" fill="' + LINE + '"/>' + blush,  // 好奇大眼
  stroke('M-6 1 H-2.5 M2.5 1 H6') + smile,                                                                 // 酷酷的
  dot(-4, 1, 1.2) + dot(4, 1, 1.2) + '<circle cx="0" cy="5" r="1" fill="' + LINE + '"/>' + blush,             // 呆萌
  arc(-4, 2, false) + arc(4, 2, false) + stroke('M-2 5 Q0 6.4 2 5') + '<path d="M-1 -4 L0 -6 L1 -4" stroke="' + LINE + '" stroke-width="1" fill="none"/>' + blush  // 驕傲（閉眼）
];
export const FACE_NAMES = ['微笑', '開心大笑', '眨眼', '超用力', '瞇瞇眼', '驚訝', '吐舌頭', '星星眼', '愛心眼', '認真臉',
  '睡覺', '哭哭', '得意', '害羞', '生氣', '嘟嘴', '貓咪嘴', '墨鏡', '暈暈', '偷笑', '好奇大眼', '酷酷的', '呆萌', '驕傲'];

/* 一顆手繪糖果球（SVG 片段，球心在 0,0，半徑 r） */
export function candyBallSVG(color, k, r = 13, shadow = true) {
  const s = r / 13;
  return (shadow ? '<ellipse cy="' + (r + 1) + '" rx="' + (r * 0.85) + '" ry="' + (r * 0.27) + '" fill="rgba(91,64,56,.18)"/>' : '')
    + '<g transform="scale(' + s.toFixed(3) + ')"><circle r="13" fill="' + color + '" stroke="' + LINE + '" stroke-width="3"/>'
    + '<ellipse cx="-6" cy="-7" rx="3.6" ry="2.3" fill="#fff" opacity=".9"/>' + FACES[k % FACES.length] + '</g>';
}
/* 給 HTML 用的小 <svg>（選球按鈕、頒獎台） */
export function candyBallImg(color, k, size) {
  return '<svg class="cface" viewBox="-17 -17 34 36" width="' + size + '" height="' + size + '" aria-hidden="true">' + candyBallSVG(color, k, 13, true) + '</svg>';
}
