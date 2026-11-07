import OBR from '@owlbear-rodeo/sdk';
import type { Item } from '@owlbear-rodeo/sdk';
import './style.css';

const ANCHOR = 'wow.token-teleporter/anchor';
const HAS_VISION = 'com.battle-system.smoke/hasVision';
const VISION = 'com.battle-system.smoke/visionRange';
const DARK = 'com.battle-system.smoke/visionDark';
const MENU_ID = 'wow.token-teleporter/mark-anchor';
const ICON = 'https://dawnwatcherl.github.io/obr-token-teleporter/icon.svg';
const app = document.querySelector<HTMLDivElement>('#app')!;
let selected = new Set<string>();
let targetId = '';
let busy = false;
let sceneReady = false;
let subscribed = false;
let menuRegistered = false;
let message = '';

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const hasSmokeVision = (item: Item) => item.layer === 'CHARACTER' && item.metadata[HAS_VISION] === true && num(item.metadata[VISION]) !== null;
const isAnchor = (item: Item) => item.metadata[ANCHOR] === true;

async function registerMenu() {
  if (menuRegistered) return;
  await OBR.contextMenu.create({
    id: MENU_ID,
    icons: [{
      icon: ICON,
      label: '设置 / 取消传送点',
      filter: { every: [{ key: 'type', value: 'IMAGE' }], permissions: ['UPDATE'] },
    }],
    onClick: async context => {
      if ((await OBR.player.getRole()) !== 'GM') return;
      if (!context.items.length) return;
      const ids = context.items.map(item => item.id);
      await OBR.scene.items.updateItems(ids, drafts => {
        for (const draft of drafts) {
          if (draft.metadata[ANCHOR] === true) delete draft.metadata[ANCHOR];
          else draft.metadata[ANCHOR] = true;
        }
      });
      await refresh();
    },
  });
  menuRegistered = true;
}

async function refresh() {
  if (!sceneReady || busy) return;
  try {
    const all = await OBR.scene.items.getItems();
    const characters = all.filter(hasSmokeVision).sort((a,b) => a.name.localeCompare(b.name));
    const anchors = all.filter(isAnchor).sort((a,b) => a.name.localeCompare(b.name));
    const ids = new Set(characters.map(item => item.id));
    selected = new Set([...selected].filter(id => ids.has(id)));
    if (!anchors.some(item => item.id === targetId)) targetId = anchors[0]?.id ?? '';
    render(characters, anchors);
  } catch (error) {
    app.textContent = '读取场景失败：' + String(error);
  }
}

function render(characters: Item[], anchors: Item[]) {
  app.innerHTML = `
    <header><h2>✦ Token 传送器</h2><span>GM 专用</span></header>
    <p class="help">右键地图上的图片 Token →「设置 / 取消传送点」。隐藏的锚点也会出现在这里。</p>
    <div class="heading"><strong>① 选择需要传送的角色</strong><button id="reload" class="small">刷新</button></div>
    <div class="list">${characters.length ? characters.map(item => `<label class="item"><input type="checkbox" data-token="${escapeHtml(item.id)}" ${selected.has(item.id)?'checked':''}><span><b>${escapeHtml(item.name || '未命名角色')}</b><small>普通视野 ${num(item.metadata[VISION])} · 黑暗视觉 ${num(item.metadata[DARK]) ?? 0}</small></span></label>`).join('') : '<p class="empty">未找到启用 Smoke & Spectre! 视野的 Character Token。</p>'}</div>
    <div class="heading"><strong>② 选择传送点</strong><small>${anchors.length} 个</small></div>
    <div class="list">${anchors.length ? anchors.map(item => `<label class="item"><input type="radio" name="anchor" data-anchor="${escapeHtml(item.id)}" ${targetId===item.id?'checked':''}><span><b>${escapeHtml(item.name || '未命名传送点')}</b><small>${escapeHtml(item.layer)} · ${Math.round(item.position.x)}, ${Math.round(item.position.y)}</small></span></label>`).join('') : '<p class="empty">还没有传送点。先在地图上右键一个图片 Token，将它设为传送点。</p>'}</div>
    <button id="teleport" class="primary" ${busy || !selected.size || !targetId?'disabled':''}>传送 ${selected.size} 个角色</button>
    <p class="status">${escapeHtml(message)}</p>
    <p class="foot">只移动 Token 位置，不更改视野、所有权或元数据。多个角色按网格错开放置。第一版仅支持同一场景。</p>`;
  app.querySelectorAll<HTMLInputElement>('[data-token]').forEach(input => input.onchange = () => {
    if (input.checked) selected.add(input.dataset.token!);
    else selected.delete(input.dataset.token!);
    render(characters, anchors);
  });
  app.querySelectorAll<HTMLInputElement>('[data-anchor]').forEach(input => input.onchange = () => {
    targetId = input.dataset.anchor!;
    render(characters, anchors);
  });
  app.querySelector<HTMLButtonElement>('#reload')!.onclick = () => void refresh();
  app.querySelector<HTMLButtonElement>('#teleport')!.onclick = () => void teleport();
}

async function teleport() {
  if (busy || !targetId || !selected.size) return;
  if ((await OBR.player.getRole()) !== 'GM') return;
  busy = true;
  try {
    const ids = [...selected];
    const fetched = await OBR.scene.items.getItems([...ids, targetId]);
    const anchor = fetched.find(item => item.id === targetId && isAnchor(item));
    if (!anchor) throw new Error('传送点已不存在，请刷新列表。');
    const moving = fetched.filter(item => ids.includes(item.id) && hasSmokeVision(item) && item.id !== targetId);
    if (!moving.length) throw new Error('没有可传送的角色。');
    const dpi = await OBR.scene.grid.getDpi();
    const spacing = Math.max(1, dpi);
    // One token lands at the anchor. Groups use a centered square arrangement.
    const columns = Math.ceil(Math.sqrt(moving.length));
    const rows = Math.ceil(moving.length / columns);
    const placements = new Map<string, {x:number;y:number}>();
    moving.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      placements.set(item.id, {
        x: anchor.position.x + (col - (columns-1)/2) * spacing,
        y: anchor.position.y + (row - (rows-1)/2) * spacing,
      });
    });
    // Full Suite portal technique: temporarily hide tokens before changing
    // their positions to bypass wall/collision listeners, then restore visibility.
    // Preserve each token's original visible flag (including already-hidden tokens).
    const visibility = new Map(moving.map(item => [item.id, item.visible]));
    const movingIds = [...placements.keys()];
    let hidden = false;
    try {
      await OBR.scene.items.updateItems(movingIds, drafts => {
        for (const item of drafts) item.visible = false;
      });
      hidden = true;
      await OBR.scene.items.updateItems(movingIds, drafts => {
        for (const item of drafts) {
          const position = placements.get(item.id);
          if (position) item.position = position;
        }
      });
    } finally {
      // Even if the position update fails, never leave characters hidden.
      if (hidden) {
        await OBR.scene.items.updateItems(movingIds, drafts => {
          for (const item of drafts) {
            const original = visibility.get(item.id);
            if (original !== undefined) item.visible = original;
          }
        });
      }
    }
    message = `已将 ${moving.length} 个角色传送至「${anchor.name || '未命名传送点'}」。`;
  } catch (error) {
    message = '传送失败：' + String(error);
  } finally {
    busy = false;
    await refresh();
  }
}

async function loadScene() {
  sceneReady = await OBR.scene.isReady();
  if (!sceneReady) {
    app.textContent = '等待 Owlbear 场景加载...';
    return;
  }
  await registerMenu();
  if (!subscribed) {
    subscribed = true;
    OBR.scene.items.onChange(() => { if (!busy) void refresh(); });
  }
  await refresh();
}

OBR.onReady(async () => {
  try {
    if ((await OBR.player.getRole()) !== 'GM') {
      app.textContent = '此扩展仅供 GM 使用。';
      return;
    }
    OBR.scene.onReadyChange(() => { void loadScene(); });
    await loadScene();
  } catch (error) {
    app.textContent = '初始化失败：' + String(error);
  }
});
