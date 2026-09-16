import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';

const SAVE_KEY='hp_minecraft_v3_save';
const CHUNK=12, RADIUS=2, REACH=6;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x7fc8f5);
scene.fog=new THREE.Fog(0x7fc8f5,28,72);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,120);
const renderer=new THREE.WebGLRenderer({antialias:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=false;
document.getElementById('game').appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xcfefff,0x43513d,1.45));
const sun=new THREE.DirectionalLight(0xffffff,.75); sun.position.set(25,40,10); scene.add(sun);

const ui={coords:document.getElementById('coords'),hotbar:document.getElementById('hotbar'),mining:document.getElementById('mining'),miningFill:document.querySelector('#mining>div'),toast:document.getElementById('toast'),overlay:document.getElementById('overlay'),overlayTitle:document.getElementById('overlayTitle'),overlayBody:document.getElementById('overlayBody'),continueBtn:document.getElementById('continueBtn'),newBtn:document.getElementById('newBtn'),craft:document.getElementById('craft'),inventoryLine:document.getElementById('inventoryLine'),seed:document.getElementById('seed')};

let seed=0, yaw=0,pitch=0,locked=false, selected=0, mining=false, miningKey='', miningProgress=0,lastTime=performance.now(), lastToast=0, placedCount=0, travelStart=null;
const keys=new Set(), loadedChunks=new Map(), blockMeshes=new Map(), edits=new Map(), discoveries=new Set();
let inventory={grass:0,dirt:0,stone:0,log:0,planks:0,sticks:0,coal:0,iron:0,copper:0,gold:0,diamond:0,emerald:0,woodPick:0,stonePick:0};
const player={pos:new THREE.Vector3(0,16,0),vel:new THREE.Vector3(),onGround:false};

const hotbar=[
 {id:'dirt',name:'Dirt',icon:'🟫',place:true},
 {id:'stone',name:'Stone',icon:'⬜',place:true},
 {id:'log',name:'Log',icon:'🪵',place:true},
 {id:'planks',name:'Planks',icon:'🟨',place:true},
 {id:'woodPick',name:'Wood Pick',icon:'⛏️'},
 {id:'stonePick',name:'Stone Pick',icon:'⛏️'}
];

const blockInfo={
 grass:{color:'#5f9e45',hard:0.45,drop:'dirt'}, dirt:{color:'#76533b',hard:0.45}, stone:{color:'#777b7e',hard:1.5},
 log:{color:'#7a542f',hard:1.0}, leaves:{color:'#477d3b',hard:.25,drop:null}, coal:{color:'#3f4346',hard:1.6}, iron:{color:'#9d816b',hard:1.9}, copper:{color:'#b86f48',hard:1.7}, gold:{color:'#caa837',hard:2.1}, diamond:{color:'#3bcbd0',hard:2.4}, emerald:{color:'#39ac62',hard:2.4}, bedrock:{color:'#303236',hard:999,drop:null}
};

const lessons={
 coal:{title:'Coal seam discovered',game:'Coal often appears in clusters. Check the blocks directly behind, above, below, and beside this one.',learn:'Pattern thinking: nearby evidence can guide where you search next.',fact:'Coal is not a mineral; it is a carbon-rich sedimentary rock formed from ancient plant material.'},
 iron:{title:'Iron ore discovered',game:'Follow the vein before moving on. Nearby stone can hide connected iron ore.',learn:'Engineering connection: iron is the main ingredient used to make steel.',fact:'Common iron ores include hematite and magnetite.'},
 copper:{title:'Copper discovered',game:'Copper can appear in groups, so inspect neighboring blocks before leaving.',learn:'Electricity connection: copper is widely used in wiring because it conducts electricity very well.',fact:'Copper is also naturally antimicrobial, meaning it can kill or slow many microbes on its surface.'},
 gold:{title:'Gold discovered',game:'Stay around this depth and explore nearby tunnels before returning to the surface.',learn:'Coordinates help you repeat a successful search strategy instead of digging randomly.',fact:'Gold resists corrosion extremely well, which is why ancient gold objects can survive for thousands of years.'},
 diamond:{title:'Diamond discovered!',game:'Search horizontally around this depth and inspect all sides of the vein. Exposed caves let you scan many blocks quickly.',learn:'Probability connection: good mining strategies increase how many candidate blocks you expose per block you break.',fact:'Diamond is made of carbon atoms in a rigid crystal structure and is the hardest known natural mineral.'},
 emerald:{title:'Emerald discovered!',game:'Remember this location and explore nearby terrain carefully. Coordinates make it easy to return.',learn:'Coordinate connection: X, Y and Z locate a point in three-dimensional space.',fact:'Emerald is the green gem variety of the mineral beryl; chromium or vanadium usually gives it its color.'},
 log:{title:'Tree collected',game:'Logs can be turned into planks, then sticks, then tools.',learn:'Biology connection: tree trunks are built largely from cellulose and lignin, materials made by living cells.',fact:'Trees add new wood in growth rings produced by a thin layer of tissue called the cambium.'}
};

function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function hash(x,y=0,z=0){let n=(x*73856093)^(y*19349663)^(z*83492791)^seed;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295}
function heightAt(x,z){return 9+Math.floor((Math.sin((x+seed%97)*.12)+Math.cos((z-seed%67)*.11)+Math.sin((x+z)*.055))*1.7+hash(x,0,z)*2.1)}
function caveAt(x,y,z){if(y<3)return false;const h=heightAt(x,z);if(y>h-2)return false;const v=Math.sin(x*.31+seed*.001)+Math.cos(z*.29-seed*.0013)+Math.sin(y*.52+x*.05);return v>2.18}
function oreAt(x,y,z){const r=hash(x,y,z);if(y<5&&r<.015)return 'diamond';if(y<7&&r<.022)return 'emerald';if(y<8&&r<.045)return 'gold';if(y<11&&r<.07)return 'iron';if(y<13&&r<.09)return 'copper';if(y<15&&r<.12)return 'coal';return 'stone'}
function treeAt(x,z){const h=heightAt(x,z);return h>8&&hash(x,77,z)>.965}
function key(x,y,z){return `${x},${y},${z}`}
function parseKey(k){return k.split(',').map(Number)}
function editValue(x,y,z){const k=key(x,y,z);return edits.has(k)?edits.get(k):undefined}
function baseBlockAt(x,y,z){if(y<=0)return 'bedrock';const h=heightAt(x,z);
 if(treeAt(x,z)){
   if(y>h&&y<=h+3)return 'log';
   if(y>=h+3&&y<=h+5&&Math.abs((x%CHUNK+CHUNK)%CHUNK-6)<=2&&Math.abs((z%CHUNK+CHUNK)%CHUNK-6)<=2)return 'leaves';
 }
 if(y>h)return null;if(caveAt(x,y,z))return null;if(y===h)return 'grass';if(y>=h-2)return 'dirt';return oreAt(x,y,z)}
function blockAt(x,y,z){const e=editValue(x,y,z);return e!==undefined?e:baseBlockAt(x,y,z)}

function tex(hex,seedOffset){const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d');g.fillStyle=hex;g.fillRect(0,0,16,16);const rnd=mulberry32((seedOffset+12345)>>>0);for(let i=0;i<55;i++){const shade=rnd()>.5?'rgba(255,255,255,.08)':'rgba(0,0,0,.09)';g.fillStyle=shade;g.fillRect(Math.floor(rnd()*16),Math.floor(rnd()*16),1+Math.floor(rnd()*2),1+Math.floor(rnd()*2));}const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;return t}
const materials={};Object.entries(blockInfo).forEach(([id,b],i)=>materials[id]=new THREE.MeshLambertMaterial({map:tex(b.color,i*9187),transparent:id==='leaves',opacity:id==='leaves'?.92:1}));
const box=new THREE.BoxGeometry(1,1,1);

function exposed(x,y,z){return [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([a,b,c])=>!blockAt(x+a,y+b,z+c))}
function addMesh(x,y,z,type){const k=key(x,y,z);if(blockMeshes.has(k)||!type)return;const m=new THREE.Mesh(box,materials[type]);m.position.set(x,y,z);m.userData={x,y,z,type,key:k};scene.add(m);blockMeshes.set(k,m);const ck=chunkKey(Math.floor(x/CHUNK),Math.floor(z/CHUNK));if(loadedChunks.has(ck))loadedChunks.get(ck).add(k)}
function removeMesh(k){const m=blockMeshes.get(k);if(m){scene.remove(m);blockMeshes.delete(k)}}
function refreshBlock(x,y,z){const k=key(x,y,z),t=blockAt(x,y,z);if(t&&exposed(x,y,z))addMesh(x,y,z,t);else removeMesh(k)}
function refreshAround(x,y,z){refreshBlock(x,y,z);[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].forEach(([a,b,c])=>refreshBlock(x+a,y+b,z+c))}
function chunkKey(cx,cz){return `${cx},${cz}`}
function loadChunk(cx,cz){const ck=chunkKey(cx,cz);if(loadedChunks.has(ck))return;loadedChunks.set(ck,new Set());for(let lx=0;lx<CHUNK;lx++)for(let lz=0;lz<CHUNK;lz++){const x=cx*CHUNK+lx,z=cz*CHUNK+lz,h=heightAt(x,z);for(let y=1;y<=h+5;y++){const t=blockAt(x,y,z);if(t&&exposed(x,y,z))addMesh(x,y,z,t)}}}
function unloadChunk(cx,cz){const ck=chunkKey(cx,cz),set=loadedChunks.get(ck);if(!set)return;for(const k of set)removeMesh(k);loadedChunks.delete(ck)}
function streamChunks(){const cx=Math.floor(player.pos.x/CHUNK),cz=Math.floor(player.pos.z/CHUNK),needed=new Set();for(let dx=-RADIUS;dx<=RADIUS;dx++)for(let dz=-RADIUS;dz<=RADIUS;dz++){const k=chunkKey(cx+dx,cz+dz);needed.add(k);loadChunk(cx+dx,cz+dz)}for(const ck of [...loadedChunks.keys()])if(!needed.has(ck)){const [x,z]=ck.split(',').map(Number);unloadChunk(x,z)}}

function respawn(){const x=Math.floor(player.pos.x),z=Math.floor(player.pos.z);player.pos.set(x+.5,heightAt(x,z)+2.7,z+.5);player.vel.set(0,0,0)}
function collidesAt(p){const minX=Math.floor(p.x-.28),maxX=Math.floor(p.x+.28),minZ=Math.floor(p.z-.28),maxZ=Math.floor(p.z+.28),minY=Math.floor(p.y-1.62),maxY=Math.floor(p.y+.12);for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(let y=minY;y<=maxY;y++)if(blockAt(x,y,z))return true;return false}
function moveAxis(axis,delta){if(!delta)return;const p=player.pos.clone();p[axis]+=delta;if(!collidesAt(p))player.pos.copy(p);else if(axis==='y'&&delta<0){player.onGround=true;player.vel.y=0}}

const ray=new THREE.Raycaster();
function targetBlock(){ray.setFromCamera(new THREE.Vector2(0,0),camera);const hits=ray.intersectObjects([...blockMeshes.values()],false);return hits.find(h=>h.distance<=REACH)||null}
function currentTool(){return hotbar[selected].id}
function speedFor(type){const tool=currentTool();let s=1;if(tool==='woodPick'&&inventory.woodPick>0)s=2.2;if(tool==='stonePick'&&inventory.stonePick>0)s=3.4;if(['dirt','grass','log','leaves'].includes(type))s*=1.6;if(['gold','diamond','emerald'].includes(type)&&tool!=='stonePick')s*=.28;return s}
function breakBlock(hit){const {x,y,z,type}=hit.object.userData;if(type==='bedrock')return;edits.set(key(x,y,z),null);const drop=blockInfo[type].drop===undefined?type:blockInfo[type].drop;if(drop&&inventory[drop]!==undefined)inventory[drop]++;refreshAround(x,y,z);if(lessons[type])educate(type,x,y,z);renderHotbar();saveSoon()}
function placeBlock(){const hit=targetBlock();if(!hit)return;const slot=hotbar[selected];if(!slot.place||!inventory[slot.id])return;const n=hit.face.normal;const x=hit.object.userData.x+Math.round(n.x),y=hit.object.userData.y+Math.round(n.y),z=hit.object.userData.z+Math.round(n.z);const test=new THREE.Vector3(x+.5,y+.5,z+.5);if(test.distanceTo(player.pos)<1.35)return;edits.set(key(x,y,z),slot.id);inventory[slot.id]--;placedCount++;refreshAround(x,y,z);renderHotbar();if(placedCount===12)softToast('Engineering idea','You have placed 12 blocks. Wide spans need support: triangles, arches and columns help structures carry loads.');saveSoon()}

function educate(type,x,y,z){const l=lessons[type];if(!l)return;const first=!discoveries.has(type);if(first){discoveries.add(type);showLesson(l,x,y,z);saveSoon();return}if(performance.now()-lastToast>45000&&Math.random()<.28){softToast(`${type[0].toUpperCase()+type.slice(1)} reminder`,l.game);lastToast=performance.now()}}
function showLesson(l,x,y,z){locked=false;document.exitPointerLock?.();ui.overlayTitle.textContent=l.title;ui.overlayBody.innerHTML=`<p><b>In-game tip:</b> ${l.game}</p><div class="learn"><b>Learning connection:</b> ${l.learn}</div><div class="fact"><b>Real-world fact:</b> ${l.fact}</div><p class="small">Found near X ${x}, Y ${y}, Z ${z}</p>`;ui.overlay.classList.remove('hidden')}
function softToast(title,text){ui.toast.innerHTML=`<strong>${title}</strong>${text}`;ui.toast.classList.add('show');clearTimeout(softToast.t);softToast.t=setTimeout(()=>ui.toast.classList.remove('show'),5200)}

function renderHotbar(){ui.hotbar.innerHTML='';hotbar.forEach((s,i)=>{const d=document.createElement('div');d.className='slot'+(i===selected?' selected':'');d.innerHTML=`<div class="icon">${s.icon}</div><div>${i+1}. ${s.name}</div><div class="count">${inventory[s.id]||''}</div>`;ui.hotbar.appendChild(d)});ui.inventoryLine.textContent=`Logs ${inventory.log} · Planks ${inventory.planks} · Sticks ${inventory.sticks} · Coal ${inventory.coal} · Iron ${inventory.iron} · Copper ${inventory.copper} · Gold ${inventory.gold} · Diamond ${inventory.diamond}`}
function craft(id){if(id==='planks'&&inventory.log>=1){inventory.log--;inventory.planks+=4;ratioTip('1 log → 4 planks');}
 else if(id==='sticks'&&inventory.planks>=2){inventory.planks-=2;inventory.sticks+=4;ratioTip('2 planks → 4 sticks, which simplifies to 1 plank → 2 sticks');}
 else if(id==='woodPick'&&inventory.planks>=3&&inventory.sticks>=2){inventory.planks-=3;inventory.sticks-=2;inventory.woodPick++;ratioTip('3 planks + 2 sticks → 1 wooden pickaxe');}
 else if(id==='stonePick'&&inventory.stone>=3&&inventory.sticks>=2){inventory.stone-=3;inventory.sticks-=2;inventory.stonePick++;ratioTip('3 stone + 2 sticks → 1 stone pickaxe');}
 else {softToast('Not enough materials','Gather the ingredients shown in the crafting menu.');return}renderHotbar();saveSoon()}
function ratioTip(text){if(!discoveries.has('ratios')){discoveries.add('ratios');softToast('Ratio lesson',`${text}. Crafting recipes are ratios: if you double a recipe, every ingredient doubles.`)}saveSoon()}

function save(){const data={seed,pos:[player.pos.x,player.pos.y,player.pos.z],inventory,discoveries:[...discoveries],edits:[...edits.entries()],selected,placedCount};localStorage.setItem(SAVE_KEY,JSON.stringify(data))}
let saveTimer;function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(save,400)}
function load(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(!s)return false;seed=s.seed;player.pos.fromArray(s.pos);inventory={...inventory,...s.inventory};(s.discoveries||[]).forEach(x=>discoveries.add(x));(s.edits||[]).forEach(([k,v])=>edits.set(k,v));selected=s.selected||0;placedCount=s.placedCount||0;return true}catch{return false}}
function newWorld(){localStorage.removeItem(SAVE_KEY);edits.clear();discoveries.clear();loadedChunks.forEach((_,k)=>{const [x,z]=k.split(',').map(Number);unloadChunk(x,z)});inventory={grass:0,dirt:0,stone:0,log:0,planks:0,sticks:0,coal:0,iron:0,copper:0,gold:0,diamond:0,emerald:0,woodPick:0,stonePick:0};seed=Math.floor(Math.random()*1e9);player.pos.set(.5,heightAt(0,0)+3,.5);player.vel.set(0,0,0);selected=0;placedCount=0;travelStart=player.pos.clone();streamChunks();renderHotbar();save();softToast('New world created',`Seed ${seed}`)}

renderer.domElement.addEventListener('click',()=>{if(!locked&&ui.overlay.classList.contains('hidden')&&!ui.craft.classList.contains('show'))renderer.domElement.requestPointerLock()});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer.domElement;if(!locked)mining=false});
document.addEventListener('mousemove',e=>{if(!locked)return;yaw-=e.movementX*.0023;pitch-=e.movementY*.0023;pitch=Math.max(-1.52,Math.min(1.52,pitch))});
document.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Space')e.preventDefault();if(e.code.startsWith('Digit')){const n=Number(e.code.slice(5))-1;if(n>=0&&n<hotbar.length){selected=n;renderHotbar()}}if(e.code==='KeyE'){ui.craft.classList.toggle('show');if(ui.craft.classList.contains('show'))document.exitPointerLock?.()}if(e.code==='KeyC')softToast('Coordinates',`X ${Math.floor(player.pos.x)}, Y ${Math.floor(player.pos.y)}, Z ${Math.floor(player.pos.z)}. Y measures height.`)});
document.addEventListener('keyup',e=>keys.delete(e.code));
renderer.domElement.addEventListener('mousedown',e=>{if(!locked)return;if(e.button===0){mining=true;miningProgress=0;miningKey=''}if(e.button===2)placeBlock()});
document.addEventListener('mouseup',e=>{if(e.button===0){mining=false;miningProgress=0;ui.mining.style.display='none'}});renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
ui.continueBtn.addEventListener('click',()=>{ui.overlay.classList.add('hidden');renderer.domElement.requestPointerLock()});
ui.newBtn.addEventListener('click',()=>{newWorld();ui.overlay.classList.add('hidden');renderer.domElement.requestPointerLock()});
document.querySelectorAll('[data-craft]').forEach(b=>b.addEventListener('click',()=>craft(b.dataset.craft)));

function update(dt){camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;const forward=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,Math.sin(yaw)),wish=new THREE.Vector3();if(keys.has('KeyW'))wish.add(forward);if(keys.has('KeyS'))wish.sub(forward);if(keys.has('KeyD'))wish.add(right);if(keys.has('KeyA'))wish.sub(right);if(wish.lengthSq())wish.normalize();const speed=4.8;moveAxis('x',wish.x*speed*dt);moveAxis('z',wish.z*speed*dt);player.onGround=false;player.vel.y-=18*dt;if(keys.has('Space')&&Math.abs(player.vel.y)<.05){const below=player.pos.clone();below.y-=.08;if(collidesAt(below))player.vel.y=7.1}moveAxis('y',player.vel.y*dt);if(player.pos.y<-10)respawn();camera.position.copy(player.pos);camera.position.y+=.05;streamChunks();ui.coords.textContent=`X ${Math.floor(player.pos.x)} · Y ${Math.floor(player.pos.y)} · Z ${Math.floor(player.pos.z)}`;
 if(!travelStart)travelStart=player.pos.clone();if(!discoveries.has('coordinates')&&player.pos.distanceTo(travelStart)>32){discoveries.add('coordinates');softToast('Coordinate lesson','You traveled more than 32 blocks. X and Z measure horizontal position while Y measures height. Coordinates let you return to exact places.');saveSoon()}
 if(mining&&locked){const hit=targetBlock();if(hit&&hit.object.userData.type!=='bedrock'){const k=hit.object.userData.key;if(k!==miningKey){miningKey=k;miningProgress=0}miningProgress+=dt*speedFor(hit.object.userData.type)/blockInfo[hit.object.userData.type].hard;ui.mining.style.display='block';ui.miningFill.style.width=Math.min(100,miningProgress*100)+'%';if(miningProgress>=1){breakBlock(hit);miningProgress=0;miningKey=''}}else{miningProgress=0;miningKey='';ui.mining.style.display='none'}}else ui.mining.style.display='none';}

function loop(now){const dt=Math.min(.04,(now-lastTime)/1000);lastTime=now;update(dt);renderer.render(scene,camera);requestAnimationFrame(loop)}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
window.addEventListener('beforeunload',save);

const hadSave=load();if(!hadSave){seed=Math.floor(Math.random()*1e9);player.pos.set(.5,heightAt(0,0)+3,.5)}travelStart=player.pos.clone();ui.seed.textContent=seed;streamChunks();renderHotbar();
ui.overlayTitle.textContent=hadSave?'Welcome back to HP Minecraft':'HP Minecraft — 3D Survival';
ui.overlayBody.innerHTML=hadSave?'<p>Your saved world is ready.</p><p><b>WASD</b> move · <b>Mouse</b> look · <b>Space</b> jump · <b>Hold left-click</b> mine · <b>Right-click</b> place · <b>1–6</b> hotbar · <b>E</b> crafting · <b>C</b> coordinate hint.</p>':'<p>This version is now a first-person 3D survival world.</p><p><b>WASD</b> move · <b>Mouse</b> look · <b>Space</b> jump · <b>Hold left-click</b> mine · <b>Right-click</b> place · <b>1–6</b> hotbar · <b>E</b> crafting.</p><p>Discoveries teach geology, engineering, coordinates, ratios, biology and electricity without stopping you constantly.</p>';
requestAnimationFrame(loop);
