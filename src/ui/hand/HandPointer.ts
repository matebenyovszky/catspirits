import { t } from '../../i18n';
export const HAND_POINTER_ID = 197;
/** Page-local pointer, never an OS mouse. Explicit click activation keeps native
 * checkbox/radio/link semantics; drag events also serve the games' touch mode. */
export class HandPointer {
  private target: HTMLElement | null = null;
  private hover: HTMLElement | null = null;
  private downX = 0; private downY = 0;
  private x = 0; private y = 0;
  private popup?: HTMLElement;
  private rangeChanged = false;
  private allowCanvas = true;
  private actionable(element: Element | null): HTMLElement | null {
    const target = element?.closest<HTMLElement>('button,a[href],input,select,label,summary,canvas,[role="button"]') ?? null;
    if (!target || target.closest('[inert],[hidden]') || target.matches(':disabled,[aria-disabled="true"]')) return null;
    if (target instanceof HTMLLabelElement && target.control) return target.control.matches(':disabled') ? null : target.control;
    return target instanceof HTMLCanvasElement && !this.allowCanvas ? null : target;
  }
  private dispatch(target: HTMLElement, type: string, buttons: number): boolean {
    return target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: HAND_POINTER_ID,
      pointerType: 'mouse', isPrimary: true, button: 0, buttons, clientX: this.x, clientY: this.y }));
  }
  move(x: number, y: number, allowCanvas = true): boolean {
    this.x = x; this.y = y; this.allowCanvas = allowCanvas;
    const hit = this.actionable(document.elementFromPoint(x,y));
    if (hit !== this.hover) {
      this.hover?.classList.remove('hand-hover'); this.hover = hit; hit?.classList.add('hand-hover');
    }
    if (this.target && (!this.target.isConnected || this.target.closest('[inert],[hidden]') || this.target.matches(':disabled') || (!allowCanvas && this.target instanceof HTMLCanvasElement))) this.cancel();
    if (this.target) {
      this.dispatch(this.target, 'pointermove', 1);
      this.updateRange(this.target);
    } else if (hit) this.dispatch(hit, 'pointermove', 0);
    return !!hit;
  }
  down(): void {
    if (this.target) return;
    this.target = this.actionable(document.elementFromPoint(this.x,this.y));
    if (!this.target) { this.closePopup(); return; }
    this.downX = this.x; this.downY = this.y; this.rangeChanged = false;
    this.target.focus({ preventScroll: true }); this.dispatch(this.target, 'pointerdown', 1); this.updateRange(this.target);
  }
  up(): void {
    const target = this.target; this.target = null;
    if (!target) return;
    if (!target.isConnected || target.closest('[inert],[hidden]') || target.matches(':disabled')) { this.dispatch(target,'pointercancel',0); return; }
    this.dispatch(target, 'pointerup', 0);
    if (target instanceof HTMLInputElement && target.type === 'range') {
      if (this.rangeChanged) target.dispatchEvent(new Event('change',{bubbles:true})); return;
    }
    const hit = this.actionable(document.elementFromPoint(this.x,this.y));
    if (target !== hit || Math.hypot(this.x-this.downX,this.y-this.downY)>45) return;
    if (target instanceof HTMLSelectElement) { this.select(target); return; }
    // detail=1 prevents controls that consume pointerdown from firing twice.
    target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:this.x,clientY:this.y}));
  }
  cancel(): void { const target=this.target;this.target=null;if(target)this.dispatch(target,'pointercancel',0); }
  private updateRange(target: HTMLElement): void {
    if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
    const box = target.getBoundingClientRect(), min = Number(target.min)||0, max = target.max ? Number(target.max) : 100;
    if (!box.width) return;
    const step = target.step === 'any' ? 0 : Number(target.step)||1;
    const raw = min + Math.max(0,Math.min(1,(this.x-box.left)/box.width))*(max-min);
    const value = String(Math.max(min,Math.min(max,step ? min+Math.round((raw-min)/step)*step : raw)));
    if (target.value !== value) { target.value=value;this.rangeChanged=true;target.dispatchEvent(new Event('input',{bubbles:true})); }
  }
  private select(select: HTMLSelectElement): void {
    this.closePopup();
    const popup=document.createElement('div');popup.className='hand-options';popup.setAttribute('role','group');popup.setAttribute('aria-label',select.getAttribute('aria-label') ?? t('Válassz egy lehetőséget'));
    for(const option of select.options){
      if(option.hidden)continue;
      const button=document.createElement('button');button.type='button';button.textContent=option.text;button.disabled=option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);button.setAttribute('aria-pressed',String(option.selected));
      button.addEventListener('click',()=>{ if(!select.isConnected || select.disabled){this.closePopup();return;}const changed=select.value!==option.value;select.value=option.value;this.closePopup();if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));} });popup.append(button);
    }
    const close=document.createElement('button');close.type='button';close.textContent=t('Bezárás');close.addEventListener('click',()=>this.closePopup());popup.append(close);
    (document.fullscreenElement ?? document.body).append(popup);this.popup=popup;
  }
  closePopup(): void { this.popup?.remove();this.popup=undefined; }
  scroll(direction: number): void {
    // Scroll the modal/menu under the cursor before falling back to the page.
    const modal = this.popup ?? [...document.querySelectorAll<HTMLElement>('[role="dialog"],.blade-overlay')].reverse().find(el=>el.getClientRects().length && !el.closest('[hidden]'));
    let element=modal ?? document.elementFromPoint(this.x,this.y) as HTMLElement|null;
    while(element){
      const overflow=getComputedStyle(element).overflowY;
      if (/(auto|scroll)/.test(overflow) && element.scrollHeight>element.clientHeight+1) {
        const before=element.scrollTop;element.scrollTop+=direction;if(element.scrollTop!==before)return;
      }
      element=element.parentElement;
    }
    window.scrollBy(0,direction);
  }
  dispose(): void {this.cancel();this.hover?.classList.remove('hand-hover');this.hover=null;this.closePopup();}
}
