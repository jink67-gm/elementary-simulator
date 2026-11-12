// 들 수 있는 물건 목록. color/shape은 손에 들었을 때와 바닥에 놓였을 때의 임시 모델.
export interface ItemDef {
  name: string;
  desc: string;
  color: number;
  shape: 'box' | 'flat' | 'cylinder' | 'plane' | 'card';
  size: [number, number, number];
  /** 모둠 정리 활동에서 넣어야 하는 칸 */
  bin?: 'cut' | 'stick' | 'paper';
}

export const ITEMS = {
  bag: { name: '책가방', desc: '오늘도 무거운 내 가방. 책상 옆에 걸어 두자.', color: 0x3f6fd8, shape: 'box', size: [0.38, 0.45, 0.2] },
  koreanBook: { name: '국어책', desc: '국어 6-2 ㉯. 오늘은 86쪽부터!', color: 0xe8834a, shape: 'flat', size: [0.26, 0.04, 0.34] },
  tablet: { name: '내 태블릿', desc: '17번 태블릿. 배터리 82%.', color: 0x2b2f3a, shape: 'flat', size: [0.3, 0.02, 0.22] },
  charger: { name: '충전기', desc: '선생님 서랍에 있던 여분 충전기.', color: 0xf2f2f2, shape: 'box', size: [0.1, 0.05, 0.1] },
  pencilCase: { name: '파란 필통', desc: '준호 이름이 적힌 필통. 지퍼가 반쯤 열려 있다.', color: 0x2f8de4, shape: 'box', size: [0.22, 0.06, 0.08] },
  paperPlane: { name: '종이비행기', desc: 'Space를 꾹 눌렀다 떼면 날아가요.', color: 0xf7f3e8, shape: 'plane', size: [0.3, 0.06, 0.22] },
  roleSpeaker: { name: '역할 카드: 발표', desc: '모둠의 목소리!', color: 0xf26b6b, shape: 'card', size: [0.16, 0.01, 0.22] },
  roleMaker: { name: '역할 카드: 제작', desc: '포스터를 꾸며요.', color: 0xf2c94c, shape: 'card', size: [0.16, 0.01, 0.22] },
  roleResearcher: { name: '역할 카드: 자료', desc: '정보를 모아요.', color: 0x56c288, shape: 'card', size: [0.16, 0.01, 0.22] },
  roleOrganizer: { name: '역할 카드: 정리', desc: '재료를 제자리에!', color: 0x6c8cf5, shape: 'card', size: [0.16, 0.01, 0.22] },
  scissors: { name: '가위', desc: '끝이 둥근 안전 가위.', color: 0xe85d75, shape: 'flat', size: [0.08, 0.02, 0.16], bin: 'cut' },
  ruler: { name: '30cm 자', desc: '누가 칼싸움하다 휜 자.', color: 0x9ad0ec, shape: 'flat', size: [0.04, 0.01, 0.3], bin: 'cut' },
  glueStick: { name: '딱풀', desc: '뚜껑이 없어졌다…', color: 0xf5d547, shape: 'cylinder', size: [0.03, 0.1, 0.03], bin: 'stick' },
  tape: { name: '셀로판테이프', desc: '끝을 못 찾겠다.', color: 0xc9ecf7, shape: 'cylinder', size: [0.06, 0.03, 0.06], bin: 'stick' },
  colorPaperPack: { name: '색종이 묶음', desc: '빨강만 다 쓰고 없다.', color: 0xff8fb1, shape: 'flat', size: [0.15, 0.03, 0.15], bin: 'paper' },
  markers: { name: '사인펜 세트', desc: '검정이 제일 빨리 닳는다.', color: 0x7d5fff, shape: 'box', size: [0.18, 0.03, 0.08], bin: 'paper' },
  colorPaper: { name: '색종이 한 장', desc: '책상에서 F를 눌러 종이비행기를 접어요.', color: 0x58c4f6, shape: 'flat', size: [0.15, 0.005, 0.15] },
  drawingPaper: { name: '미니 도화지', desc: '책상에서 F를 눌러 꾸며요. 풀이 필요해!', color: 0xfffaf0, shape: 'flat', size: [0.2, 0.005, 0.28] },
  glue: { name: '하린이 풀', desc: '빌린 풀. 다 쓰면 돌려주자.', color: 0xffe066, shape: 'cylinder', size: [0.03, 0.1, 0.03] },
  miniPoster: { name: '내 미니 포스터', desc: '교실 뒤 게시판에 전시할 수 있어요.', color: 0xffd6a5, shape: 'flat', size: [0.2, 0.01, 0.28] },
  cutterUnit: { name: '안전 절단기', desc: '레일을 식탁에 걸면 버튼으로 자르는 급식실 기계. 거대 돈가스 식탁에서 F.', color: 0xffc300, shape: 'box', size: [0.4, 0.18, 0.25] },
  ladle: { name: '국자', desc: '국 뜨는 국자. 돈가스는… 못 자를 것 같다.', color: 0xc0c7cf, shape: 'flat', size: [0.08, 0.04, 0.34] },
  trayStack: { name: '식판 여섯 개', desc: '친구들 식탁에서 F를 누르면 식판을 놓아요.', color: 0xd7dde3, shape: 'flat', size: [0.36, 0.1, 0.28] },
  cutletPiece: { name: '돈가스 조각', desc: '친구에게 가서 F를 누르면 식판에 담아요. 크면 절단기 패널에서 반으로!', color: 0xc8803a, shape: 'box', size: [0.3, 0.06, 0.3] },
  foldTable: { name: '접이식 테이블', desc: '복도의 X 표시에서 F를 누르면 펼쳐요.', color: 0xe9e4d4, shape: 'flat', size: [0.5, 0.06, 0.3] },
  scraps: { name: '종이 조각', desc: '분리수거함 종이칸에 버리자.', color: 0xdddddd, shape: 'box', size: [0.12, 0.05, 0.12] },
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

export function itemDef(id: ItemId): ItemDef {
  return ITEMS[id] as ItemDef;
}
