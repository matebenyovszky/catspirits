// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HandPointer } from './HandPointer';
let pointer:HandPointer, hit:Element|null;
beforeEach(()=>{document.body.innerHTML='';hit=null;vi.stubGlobal('PointerEvent',class extends MouseEvent {pointerId:number;constructor(type:string,init:PointerEventInit){super(type,init);this.pointerId=init.pointerId!;}});Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>hit});pointer=new HandPointer();});
afterEach(()=>{pointer.dispose();vi.unstubAllGlobals();});
function element<T extends HTMLElement>(html:string):T{document.body.innerHTML=html;hit=document.body.firstElementChild;return hit as T;}
it('activates a native checkbox exactly once and uses detail=1 for pointer-aware buttons',()=>{
  const checkbox=element<HTMLInputElement>('<input type="checkbox">'),change=vi.fn();checkbox.addEventListener('change',change);
  pointer.move(10,10);pointer.down();pointer.up();expect(checkbox.checked).toBe(true);expect(change).toHaveBeenCalledOnce();
  const button=element<HTMLButtonElement>('<button>Jump</button>'),events:string[]=[];for(const type of ['pointerdown','pointerup','click'])button.addEventListener(type,e=>events.push(`${type}:${(e as MouseEvent).detail}`));
  pointer.move(10,10);pointer.down();pointer.up();expect(events).toEqual(['pointerdown:0','pointerup:0','click:1']);
});
it('cancels on loss, hidden/disabled controls, and canvas takeover by a camera game',()=>{
  const button=element<HTMLButtonElement>('<button>Start</button>'),click=vi.fn(),cancel=vi.fn();button.addEventListener('click',click);button.addEventListener('pointercancel',cancel);
  pointer.move(10,10);pointer.down();pointer.cancel();pointer.up();expect(click).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();
  pointer.down();button.disabled=true;pointer.up();expect(click).not.toHaveBeenCalled();
  const canvas=element<HTMLCanvasElement>('<canvas></canvas>'),down=vi.fn();canvas.addEventListener('pointerdown',down);pointer.move(10,10,false);pointer.down();expect(down).not.toHaveBeenCalled();
});
it('drags on the original canvas and never clicks another target on release',()=>{
  const canvas=element<HTMLCanvasElement>('<canvas></canvas>'),events:string[]=[];for(const t of ['pointerdown','pointermove','pointerup','click'])canvas.addEventListener(t,()=>events.push(t));
  pointer.move(20,20);events.length=0;pointer.down();hit=null;pointer.move(150,140);pointer.up();expect(events).toEqual(['pointerdown','pointermove','pointerup']);
});
it('adjusts volume with input during drag and change on release',()=>{
  const range=element<HTMLInputElement>('<input type="range" min="0" max="100" step="5" value="0">'),input=vi.fn(),change=vi.fn();range.getBoundingClientRect=()=>({left:0,width:100} as DOMRect);range.addEventListener('input',input);range.addEventListener('change',change);
  pointer.move(32,10);pointer.down();expect(range.value).toBe('30');pointer.move(79,10);pointer.up();expect(range.value).toBe('80');expect(input).toHaveBeenCalledTimes(2);expect(change).toHaveBeenCalledOnce();
});
it('opens a page-local option picker and dispatches one change without a native popup',()=>{
  const select=element<HTMLSelectElement>('<select aria-label="Language"><option value="en">English</option><option value="hu">Magyar</option></select>'),change=vi.fn();select.addEventListener('change',change);
  pointer.move(10,10);pointer.down();pointer.up();expect(document.querySelector('.hand-options')).not.toBeNull();
  hit=document.querySelectorAll('.hand-options button')[1];pointer.move(20,20);pointer.down();pointer.up();expect(select.value).toBe('hu');expect(change).toHaveBeenCalledOnce();expect(document.querySelector('.hand-options')).toBeNull();
});
