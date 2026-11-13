import './style.css';
import { Game } from './core/Game';
import { Morning } from './story/Morning';
import { Menus } from './ui/Menus';
import type { SaveData } from './core/SaveData';
import { PERIODS, type PeriodId } from './core/SaveData';
import { preloadCharacterModels, modelErrors } from './world/models';
import { preloadProps, propErrors } from './world/props';
import { preloadPbr, pbrErrors } from './world/pbr';

/** 게임에서 쓰는 3D 캐릭터 모델 (public/models/characters/*.glb) */
// 3D 인물 모델은 쓰지 않는다(사용자 결정: 블록 캐릭터로 게임 플레이 우선). 다시 쓰려면 id 목록을 넣는다.
const CHARACTER_MODELS: string[] = [];

function fail(msg: string) {
  const l = document.getElementById('loading');
  if (l) {
    l.className = 'loading error';
    l.innerHTML = msg;
  }
}

async function boot() {
  const app = document.getElementById('app')!;
  const loading = document.getElementById('loading');
  await Promise.all([
    preloadCharacterModels(CHARACTER_MODELS, (d, n) => {
      if (loading) loading.textContent = `학교 가는 중… 친구들 불러오는 중 (${d}/${n})`;
    }),
    preloadProps(),
    preloadPbr(),
  ]);
  let game: Game;
  try {
    game = new Game(app);
  } catch (e) {
    console.error(e);
    fail('이 컴퓨터에서는 3D 화면(WebGL)을 열 수 없어요.<br>크롬이나 엣지 최신 버전에서 열어 주세요. 그래도 안 되면 선생님께 알려 주세요.');
    return;
  }
  document.getElementById('loading')?.remove();
  const story = new Morning(game);
  const menus = new Menus(game, (save: SaveData) => game.begin(save, story));
  story.onChapterEnd = (save) => setTimeout(() => menus.chapterEnd(save, story.recap()), 1200);
  story.onEnding = (save, ending, epi) => setTimeout(() => menus.ending(save, ending, epi, story.recap()), 1200);
  game.onPauseRequest = () => menus.pause();
  menus.title();
  for (const m of [...modelErrors, ...propErrors, ...pbrErrors]) game.hud.toast(m, 'warn', 8000);

  // 자동 테스트·디버그용 (주소 끝에 ?debug)
  if (new URLSearchParams(location.search).has('debug')) {
    const api = {
      game,
      story,
      menus,
      state: () => ({
        period: story.period,
        phase: story.phase,
        objective: game.hud.objectiveText,
        flags: { ...game.save?.flags },
        inventory: game.inventory.list(),
        held: game.inventory.held,
        seated: !!game.player?.seat,
        pos: game.player ? [game.player.pos.x, game.player.pos.z] : null,
        focus: game.interactions.focus ? { e: game.interactions.focus.eLabel, f: game.interactions.focus.fLabel, id: game.interactions.focus.target.id } : null,
        dialogue: game.dialogue.currentText,
        wish: game.save?.playerWish,
        role: game.save?.groupRole,
        cafeteria: game.save?.cafeteriaSolution,
        results: game.save?.results,
        fps: game.fps,
      }),
      /** 상호작용 대상 앞으로 순간이동 (실제 E/F 입력은 키보드로) */
      goto: (id: string, dist = 0.7, from?: [number, number]) => {
        const it = game.interactions.get(id);
        if (!it) return false;
        const p = game.interactions.position(it);
        const pl = game.player;
        const dx = from ? from[0] : pl.pos.x - p.x, dz = from ? from[1] : pl.pos.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        let x = p.x + (dx / d) * dist, z = p.z + (dz / d) * dist;
        if (id === 'seat') { x = p.x; z = p.z + 0.5; }
        pl.teleport(x, z, Math.atan2(p.x - x, p.z - z), p.y < -1.8 ? -3.6 : 0);
        return true;
      },
      teleport: (x: number, z: number, y = 0) => game.player.teleport(x, z, undefined, y),
      skipTo: (p: PeriodId) => {
        if (!PERIODS.includes(p)) return false;
        game.save.period = p;
        story.start(game.save);
        return true;
      },
      press: (k: string) => game.input.simulatePress(k),
    };
    (window as unknown as { __sim: typeof api }).__sim = api;
  }
}

void boot();
