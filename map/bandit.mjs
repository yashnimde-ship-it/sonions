// The bandit: an original 16x24 cartoon burglar (beanie, eye mask, striped shirt,
// dark trousers, loot sack). Frames follow FireRed's sAnimTable_Standard order:
// 0 down, 1 up, 2 left, 3-4 walk down, 5-6 walk up, 7-8 walk left. Right = mirrored left.

import { sprite } from './draw.mjs';

export const FRAME_W = 16;
export const FRAME_H = 24;

const PAL = {
  K: '#12121a', B: '#262a3a', b: '#3e4560', k: '#1a1c28',
  S: '#e8b088', s: '#b87850', M: '#0c0c10', W: '#ececf2', Z: '#24242e',
  P: '#2c2f40', H: '#15151b',
};
const SACK = ['#6e4e2a', '#9c7444', '#c0965e'];

const HEAD_FRONT = [
  '.....KKKKKK.....',
  '....KBBBBBBK....',
  '...KBBbBBBBBK...',
  '...KBBBBBBBBK...',
  '...KkkkkkkkkK...',
  '...KSSSSSSSSK...',
  '...KMMMMMMMMK...',
  '...KMWMMMMWMK...',
  '...KSSSSSSSSK...',
  '....KSSssSSK....',
  '.....KKSSKK.....',
];
const HEAD_BACK = [
  '.....KKKKKK.....',
  '....KBBBBBBK....',
  '...KBBbBBBBBK...',
  '...KBBBBBBBBK...',
  '...KkkkkkkkkK...',
  '...KBBBBBBBBK...',
  '...KMMMMMMMMK...',
  '...KMMMMMMMMK...',
  '...KssssssssK...',
  '....KssssssK....',
  '.....KKssKK.....',
];
const HEAD_SIDE = [
  '.....KKKKKK.....',
  '....KBBBBBBK....',
  '...KBBbBBBBBK...',
  '...KBBBBBBBBK...',
  '...KkkkkkkkkK...',
  '..KSSSSSSBBBK...',
  '..KMMMMMMMMBK...',
  '..KWMMMMMMMBK...',
  '.KSSSSSSSSBBK...',
  '..KSSssSSSSK....',
  '....KKSSSKK.....',
];
const BODY_FRONT = [
  '..KWWWWWWWWWWK..',
  '..KZZZZZZZZZZK..',
  '..KWWWWWWWWWWK..',
  '..KZZZZZZZZZZK..',
  '..KSKWWWWWWKSK..',
  '...KKZZZZZZKK...',
  '....KPPPPPPK....',
  '....KPPPPPPK....',
];
const BODY_SIDE = [
  '....KWWWWWWK....',
  '....KZZZZZZK....',
  '....KWWSSWWK....',
  '....KZZSSZZK....',
  '....KWWWWWWK....',
  '....KZZZZZZK....',
  '....KPPPPPPK....',
  '....KPPPPPPK....',
];
const LEGS_FRONT = ['....KPPKKPPK....', '....KPPKKPPK....', '....KPPKKPPK....', '...KHHHKKHHHK...', '...KKKK..KKKK...'];
const LEGS_FRONT_STEP = ['....KPPKKPPK....', '....KPPKKPPK....', '...KHHHKKPPK....', '...KKKK.KHHHK...', '.........KKKK...'];
const LEGS_SIDE = ['.....KPPPPK.....', '.....KPPPPK.....', '.....KPPPPK.....', '....KHHHHHK.....', '....KKKKKKK.....'];
const LEGS_SIDE_STEP = ['....KPPKPPK.....', '...KPPK.KPPK....', '..KPPK...KPPK...', '.KHHHK...KHHHK..', '.KKKKK...KKKKK..'];

const mirrorRow = (r) => [...r].reverse().join('');

function sack(s, cx, cy, rx, ry) {
  s.ellipse(cx, cy, rx, ry, SACK[1]);
  s.ellipse(cx - 1, cy - 1, rx * 0.55, ry * 0.5, SACK[2]);
  s.ellipse(cx + 1, cy + ry * 0.5, rx * 0.6, ry * 0.3, SACK[0]);
  s.rect(cx - 1, cy - ry - 1, 3, 2, SACK[0]); // tied neck
}

function frame(view, legs) {
  const s = sprite(FRAME_W, FRAME_H);
  if (view === 'down') sack(s, 12.5, 9, 3.5, 4.5); // peeking over the shoulder
  if (view === 'left') sack(s, 12.5, 13, 3.5, 5); // slung on the back
  const head = view === 'down' ? HEAD_FRONT : view === 'up' ? HEAD_BACK : HEAD_SIDE;
  const body = view === 'left' ? BODY_SIDE : BODY_FRONT;
  s.art(0, 0, [...head, ...body, ...legs], PAL);
  if (view === 'up') {
    sack(s, 8, 14, 5, 5.5); // big sack on the back
    s.px(10, 8, 'M');
    s.px(11, 9, 'M');
    s.px(10, 10, 'M'); // mask knot
  }
  return s;
}

export function banditFrames() {
  const mirrorLegs = (legs) => legs.map(mirrorRow);
  return [
    frame('down', LEGS_FRONT),
    frame('up', LEGS_FRONT),
    frame('left', LEGS_SIDE),
    frame('down', LEGS_FRONT_STEP),
    frame('down', mirrorLegs(LEGS_FRONT_STEP)),
    frame('up', LEGS_FRONT_STEP),
    frame('up', mirrorLegs(LEGS_FRONT_STEP)),
    frame('left', LEGS_SIDE_STEP),
    frame('left', mirrorLegs(LEGS_SIDE_STEP)),
  ];
}
