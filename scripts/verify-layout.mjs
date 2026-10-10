const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
// 材质探针(`?material=`)与纹理背板(`?texture=1`)同样是 page,只有主工作区不带查询参数。
// 选错 target 会让断言全部落在辅助窗口上,所以这里必须显式排除 —— 两个都要排。
const isWorkspace = (x) =>
  x.type === 'page' && !x.url.includes('material=') && !x.url.includes('texture=');
const page = list.find(isWorkspace) ?? list.find((x) => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) { const x = pend.get(m.id); if (x) { pend.delete(m.id); x(m); } return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description || '').split('\n')[0]);
};
const send = (method, params={}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({id:i, method, params})); });
await new Promise(r => ws.onopen = r);
await send('Runtime.enable'); await send('Page.enable');
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond, detail='') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

await ev('localStorage.clear()');
await send('Page.reload', { ignoreCache: true });
await sleep(4000);

const snap = () => ev(`JSON.stringify({
  tools: [...document.querySelectorAll('.tool-button')].map(b=>b.getAttribute('aria-label')),
  highlight: document.querySelector('.tool-button.is-active')?.getAttribute('aria-label') ?? null,
  groups: [...document.querySelectorAll('.group')].map(g=>({tabs:[...g.querySelectorAll('.tab')].map(t=>t.textContent.trim()),active:g.querySelector('.tab.is-active')?.textContent.trim()})),
  splits: document.querySelectorAll('.split').length,
  paneCount: document.querySelector('.pane-count')?.textContent,
  panes: ['.agent-pane','.notes-pane','.board-pane'].filter(s=>document.querySelector(s)),
  isEmptyHost: !!document.querySelector('.empty-host')
})`);
const S = async () => JSON.parse(await snap());
const groupBtn = async (i, l) => { await ev(`(()=>{const g=document.querySelectorAll('.group')[${i}];const b=g?.querySelector('.group-action[aria-label="${l}"]');if(b)b.click();return !!b;})()`); await sleep(450); };
const tool = async (l) => { await ev(`(()=>{const b=[...document.querySelectorAll('.tool-button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(l)});if(b)b.click();return !!b;})()`); await sleep(450); };

let s = await S();
check('工具栏三个独立入口', JSON.stringify(s.tools) === '["Agent","Notes","Board"]', JSON.stringify(s.tools));
check('初始 1 个 Agent 面板', s.groups.length === 1 && s.groups[0].tabs.join() === 'Agent' && s.panes.includes('.agent-pane'));
check('工具栏高亮跟随焦点', s.highlight === 'Agent');

const winBtns = await ev(`JSON.stringify([...document.querySelectorAll('.window-button')].map(b=>{const r=b.getBoundingClientRect();return {t:b.title,w:Math.round(r.width),h:Math.round(r.height)};}))`);
check('窗口按钮已渲染且有尺寸', JSON.parse(winBtns).length === 3 && JSON.parse(winBtns).every(b=>b.w > 10 && b.h > 10), winBtns);

await tool('Notes'); s = await S();
check('新增 Notes 标签并聚焦', s.groups[0].tabs.join() === 'Agent,Notes' && s.groups[0].active === 'Notes', s.groups[0].tabs.join());
await tool('Notes'); s = await S();
check('重开已有工具 = 聚焦不新增', s.groups[0].tabs.join() === 'Agent,Notes' && s.groups[0].active === 'Notes');

await groupBtn(0, 'Split horizontally'); s = await S();
check('横向分割得到 2 栏', s.splits === 1 && s.groups.length === 2, `splits=${s.splits}`);
// 此刻 Board 尚不存在，正好用来验证「新面板落在焦点分组，而不是第一个分组」
await tool('Board'); s = await S();
check('新面板落在焦点分组(非第一个)', s.groups[0].tabs.join() === 'Agent,Notes' && s.groups[1].tabs.join() === 'Notes,Board', JSON.stringify(s.groups.map(g=>g.tabs.join())));
check('工具栏高亮切到新面板', s.highlight === 'Board');
await tool('Agent'); s = await S();
check('重开另一已有工具仍=聚焦不新增', s.groups[0].tabs.join() === 'Agent,Notes' && s.groups[1].tabs.join() === 'Notes,Board', JSON.stringify(s.groups.map(g=>g.tabs.join())));
await groupBtn(1, 'Split vertically'); s = await S();
check('纵向分割可嵌套到 3 栏', s.splits === 2 && s.groups.length === 3, `splits=${s.splits} groups=${s.groups.length}`);

// 拖拽 + 键盘
const box = JSON.parse(await ev(`(()=>{const r=document.querySelector('.divider').getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));
const basis = () => ev(`JSON.stringify([...document.querySelectorAll('.split-part')].map(p=>p.style.flexBasis))`);
const before = await ev(`document.querySelector('.divider').getAttribute('aria-valuenow')`);
await send('Input.dispatchMouseEvent', { type:'mousePressed', x:box.x, y:box.y, button:'left', buttons:1, clickCount:1 });
await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:box.x+120, y:box.y, button:'left', buttons:1 });
await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:box.x+120, y:box.y, button:'left', buttons:0, clickCount:1 });
await sleep(400);
const after = await ev(`document.querySelector('.divider').getAttribute('aria-valuenow')`);
check('拖拽分隔器改变比例', Number(after) !== Number(before), `${before}% -> ${after}%`);
await ev(`document.querySelector('.divider').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}))`);
await sleep(300);
const kb = await ev(`document.querySelector('.divider').getAttribute('aria-valuenow')`);
check('键盘方向键改变比例', Number(kb) < Number(after), `${after}% -> ${kb}%`);
await ev(`(()=>{const d=document.querySelector('.divider');const r=d.getBoundingClientRect();d.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+2,clientY:r.top+2,pointerId:1}));})()`);
await sleep(200);

// 关掉所有面板
const total = Number((await S()).paneCount);
for (let i = 0; i < total; i++) { await ev(`(()=>{const b=[...document.querySelectorAll('.group-action[aria-label="Close pane"]')].at(-1);if(b)b.click();})()`); await sleep(300); }
s = await S();
check('全部关闭后显示空态', s.isEmptyHost && s.paneCount === '0', JSON.stringify({empty:s.isEmptyHost, count:s.paneCount}));

// 关掉后重新打开仍可用
await tool('Agent'); s = await S();
check('空态后可重新打开面板', s.groups.length === 1 && s.panes.includes('.agent-pane'));

check('全程无未捕获异常', errors.length === 0, errors.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();
process.exit(fail ? 1 : 0);
