// ============================================================
// 🐻 熊熊小夥伴：熊熊遊樂園計分用的原創小角色
//  - 8 種動物 × 6 種顏色 = 48 隻；表情借用糖果球的 24 種表情
//  - 跟糖果球同一套手繪風：扁平色塊＋深咖啡外框
//  - 座標以頭的中心為 0,0，頭半徑 13（和糖果球一樣）
// ============================================================
import { LINE, FACES } from './candy-faces.js?v=202611021956';

export const ANIMALS = ['熊熊', '兔兔', '貓咪', '狗狗', '倉鼠', '小雞', '青蛙', '狐狸'];
export const AVATAR_COUNT = 48;

// 每種動物 6 種顏色：[頭的顏色, 耳朵內側／點綴]
const PALETTES = [
  [['#e8c39e', '#f6dcc4'], ['#c99b72', '#ecc9a8'], ['#f3e3cf', '#e7c7a8'], ['#a97c5c', '#dcb08c'], ['#f2c9d4', '#fbe3ea'], ['#d9b48f', '#f2d6bb']],  // 熊熊
  [['#fdf6ee', '#f6b8c8'], ['#f1d9df', '#f29bb3'], ['#e9dccb', '#f2b9b0'], ['#d9e6f2', '#f6b8c8'], ['#f6e7b9', '#f3a9a0'], ['#e5d6f0', '#f4aac2']],  // 兔兔
  [['#f6c58f', '#f8dcc0'], ['#cfcac4', '#f3c1cc'], ['#fdf3e4', '#f6c2cd'], ['#e7b07f', '#f6d1b0'], ['#9a8f8a', '#e9b8c3'], ['#f0d9b5', '#f5c6c6']],  // 貓咪
  [['#f1d3a9', '#c79a6b'], ['#fbf1e2', '#b98c66'], ['#d7a978', '#9b6e4c'], ['#efe4d6', '#8f7464'], ['#f3c79a', '#c08458'], ['#e6cbb5', '#a77f68']],  // 狗狗
  [['#f6d7a6', '#f8e8cc'], ['#f1e2cf', '#f7c3c3'], ['#e8c095', '#fbe0c2'], ['#fff3dd', '#f4c7a6'], ['#e3c9b6', '#f5d8c8'], ['#f5cf8f', '#fff0d4']],  // 倉鼠
  [['#ffe27a', '#ffb347'], ['#fff1a8', '#ffa94d'], ['#ffd65c', '#ff9e57'], ['#fbe7b2', '#f7a072'], ['#fff3c4', '#ffb84d'], ['#ffdf8a', '#f59a5b']],  // 小雞
  [['#b9e2a6', '#e9f6dd'], ['#9fd6b0', '#e2f4e6'], ['#cfe8a3', '#f1f8dc'], ['#a8d8c4', '#e3f3ec'], ['#c6e4b8', '#f0f8ea'], ['#b4dc9a', '#ebf6df']],  // 青蛙
  [['#f4a76a', '#fff4e8'], ['#f0b98a', '#fffaf2'], ['#e8955b', '#fff1e0'], ['#f6c08d', '#fffaf3'], ['#eaa27f', '#fff3ea'], ['#f3b274', '#fff6ea']],  // 狐狸
];

const S = (d, fill, w = 2.4) => '<path d="' + d + '" fill="' + fill + '" stroke="' + LINE + '" stroke-width="' + w + '" stroke-linejoin="round"/>';
const C = (x, y, r, fill, w = 2.4) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '" stroke="' + LINE + '" stroke-width="' + w + '"/>';
const E = (x, y, rx, ry, fill, rot = 0, w = 2.4) => '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"'
  + (rot ? ' transform="rotate(' + rot + ' ' + x + ' ' + y + ')"' : '') + (w ? ' stroke="' + LINE + '" stroke-width="' + w + '"' : '') + '/>';

/* 頭後面的部分（耳朵等）、頭上面的裝飾 */
function back(a, c, d) {
  switch (a) {
    case 0: return C(-9.5, -9.5, 5, c) + C(9.5, -9.5, 5, c) + '<circle cx="-9.5" cy="-9.5" r="2.4" fill="' + d + '"/><circle cx="9.5" cy="-9.5" r="2.4" fill="' + d + '"/>';
    case 1: return E(-5, -16, 3.8, 9, c, -10) + E(5, -16, 3.8, 9, c, 10) + E(-5, -15.5, 1.8, 6, d, -10, 0) + E(5, -15.5, 1.8, 6, d, 10, 0);
    case 2: return S('M-12 -4 L-11 -16 L-3 -11.5Z', c) + S('M12 -4 L11 -16 L3 -11.5Z', c) + '<path d="M-10 -7 L-9.6 -13 L-5.5 -10.6Z" fill="' + d + '"/><path d="M10 -7 L9.6 -13 L5.5 -10.6Z" fill="' + d + '"/>';
    case 3: return E(-12, -1, 4.2, 8, d, 18) + E(12, -1, 4.2, 8, d, -18);
    case 4: return C(-9, -10.5, 3.6, c) + C(9, -10.5, 3.6, c) + '<circle cx="-9" cy="-10.5" r="1.7" fill="' + d + '"/><circle cx="9" cy="-10.5" r="1.7" fill="' + d + '"/>';
    case 5: return '';
    case 6: return C(-6.5, -11, 4.6, c) + C(6.5, -11, 4.6, c) + '<circle cx="-6.5" cy="-11" r="2.6" fill="#fff"/><circle cx="6.5" cy="-11" r="2.6" fill="#fff"/>'
      + '<circle cx="-6.5" cy="-11" r="1.3" fill="' + LINE + '"/><circle cx="6.5" cy="-11" r="1.3" fill="' + LINE + '"/>';
    case 7: return S('M-12.5 -2 L-9.5 -17 L-2.5 -10.5Z', c) + S('M12.5 -2 L9.5 -17 L2.5 -10.5Z', c) + '<path d="M-10.6 -11 L-9.6 -15.6 L-7.2 -12.8Z" fill="' + d + '"/><path d="M10.6 -11 L9.6 -15.6 L7.2 -12.8Z" fill="' + d + '"/>';
  }
  return '';
}
function front(a, c, d) {
  switch (a) {
    case 0: return E(0, 5.4, 4.2, 3, d, 0, 0) + '<ellipse cx="0" cy="3.4" rx="1.6" ry="1.1" fill="' + LINE + '"/>';   // 熊熊：鼻子
    case 3: return '<ellipse cx="0" cy="3.6" rx="1.7" ry="1.2" fill="' + LINE + '"/>';                                  // 狗狗：鼻子
    case 4: return '<ellipse cx="-8.5" cy="5" rx="3.6" ry="2.8" fill="' + d + '"/><ellipse cx="8.5" cy="5" rx="3.6" ry="2.8" fill="' + d + '"/>';   // 倉鼠：腮幫子
    case 5: return '<path d="M-2 -12 Q-1 -18 1 -13.5 Q3 -17 3 -12" fill="' + c + '" stroke="' + LINE + '" stroke-width="1.6" stroke-linejoin="round"/>'
      + '<path d="M-2.2 3.2 L2.2 3.2 L0 5.8Z" fill="' + d + '" stroke="' + LINE + '" stroke-width="1"/>';           // 小雞：呆毛＋嘴
    case 7: return '<path d="M-12.8 2 Q-6 13 0 12.8 Q6 13 12.8 2 Q8 9 0 9 Q-8 9 -12.8 2Z" fill="' + d + '"/>';       // 狐狸：白臉頰
  }
  return '';
}

// 只用正向的表情（不用哭哭、生氣、暈暈、睡覺）
const HAPPY = [0, 1, 2, 3, 4, 6, 7, 8, 12, 13, 15, 16, 17, 19, 20, 21, 22, 23, 5];

/* 一隻小角色的 SVG 片段（中心 0,0） */
export function avatarSVG(index) {
  const i = ((index % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  const a = i % 8, [c, d] = PALETTES[a][Math.floor(i / 8)];
  const face = a === 6 ? '' : FACES[HAPPY[(i * 7) % HAPPY.length]];   // 青蛙的眼睛長在頭上，臉只畫嘴巴
  const frogMouth = a === 6 ? '<path d="M-4 3 Q0 6.5 4 3" stroke="' + LINE + '" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="-7.5" cy="3.4" r="2" fill="#f28da6" opacity=".7"/><circle cx="7.5" cy="3.4" r="2" fill="#f28da6" opacity=".7"/>' : '';
  return back(a, c, d)
    + '<circle r="13" fill="' + c + '" stroke="' + LINE + '" stroke-width="2.6"/>'
    + '<ellipse cx="-6" cy="-7" rx="3" ry="1.8" fill="#fff" opacity=".7"/>'
    + front(a, c, d) + face + frogMouth;
}

/* 給 HTML 用的 <svg> */
export function avatarImg(index, size = 64) {
  return '<svg class="bf-avatar" viewBox="-21 -26.5 42 42" width="' + size + '" height="' + size + '" aria-hidden="true">' + avatarSVG(index) + '</svg>';
}

/* 沒選小角色時，依座號自動給一隻（相鄰座號不會是同一種動物） */
export function seatAvatar(seat) {
  const n = Math.max(1, seat | 0) - 1;
  return (Math.floor(n / 8) % 6) * 8 + (n % 8);
}
export function avatarOf(student) {
  return student.avatar >= 0 ? student.avatar : seatAvatar(student.seat);
}
export function avatarName(index) {
  return ANIMALS[((index % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT % 8];
}
