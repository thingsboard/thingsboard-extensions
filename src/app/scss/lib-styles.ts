import { Component, Type, ViewEncapsulation, ɵComponentDef, ɵNG_COMP_DEF } from '@angular/core';

export const addLibraryStyles = (target: string) => {
  addStyleFromComponent(LibStylesEntryComponent, target);
}

@Component({
  selector: 'tb-lib-styles-entry',
  template: '',
  styleUrls: ['./style.comp.scss'],
  standalone: true,
  encapsulation: ViewEncapsulation.None
})
class LibStylesEntryComponent {

  constructor() { }

}

const addStyleFromComponent = (type: Type<any>, target: string)=> {
  const def: ɵComponentDef<any> = type[ɵNG_COMP_DEF];
  if (def.styles?.length) {
    const style = def.styles[0];
    let targetStyle: HTMLStyleElement = document.getElementById(target) as any;
    if (!targetStyle) {
      targetStyle = document.createElement('style');
      targetStyle.id = target;
      const head = document.head || document.getElementsByTagName('head')[0];
      head.appendChild(targetStyle);
    }
    targetStyle.innerHTML = style;
  }
}
