import {LEVEL_CITIES,getLevelCity} from './city-levels.js?v=20261107-cities10';

// A paged, keyboard-accessible gallery. No page scrolling or mobile dropdown.
// A card only selects; the explicit battle button is the only way to launch.
export function createLevelPicker({document:doc=globalThis.document,window:win=globalThis.window,onSelect=()=>{},onSound=()=>{}}={}) {
  const $=id=>doc?.getElementById(id),grid=$('cityGrid'),input=$('startingLevel');
  if(!grid||!input)return {open(){},dispose(){}};
  const removers=[],cards=[],pageButtons=[];
  const listen=(el,event,fn)=>{el?.addEventListener?.(event,fn);removers.push(()=>el?.removeEventListener?.(event,fn));};
  const make=(tag,cls,text)=>{const node=doc.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  let selected=getLevelCity(input.value).level,page=0,pageSize=6;
  const text=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  function focusSelected(){cards[selected-1]?.focus?.({preventScroll:true});}
  function setPage(next,focus=false){
    const pages=Math.ceil(cards.length/pageSize);
    page=Math.max(0,Math.min(pages-1,next));
    cards.forEach((card,i)=>{card.hidden=Math.floor(i/pageSize)!==page;card.tabIndex=card.hidden?-1:0;});
    const start=page*pageSize+1,end=Math.min(cards.length,(page+1)*pageSize);
    text('cityPageLabel',String(start).padStart(2,'0')+' — '+String(end).padStart(2,'0')+' / 15');
    if($('cityPrevious'))$('cityPrevious').disabled=page===0;
    if($('cityNext'))$('cityNext').disabled=page===pages-1;
    pageButtons.forEach((button,i)=>{button.hidden=i>=pages;button.setAttribute('aria-current',i===page?'page':'false');});
    if(focus)cards[page*pageSize]?.focus?.({preventScroll:true});
  }
  function select(level,{focus=false,sound=true}={}){
    const city=getLevelCity(level);selected=city.level;input.value=String(selected);
    for(const card of cards)card.setAttribute('aria-pressed',String(Number(card.dataset.level)===selected));
    const image=$('cityPreviewImage');if(image){image.src=city.image;image.alt=city.name+' — προεπισκόπηση της πόλης στο παιχνίδι';}
    text('cityPreviewName',city.name);text('cityPreviewDescription',city.description);
    text('cityPreviewLevel','LEVEL '+String(selected).padStart(2,'0'));
    text('cityPreviewWeather',city.weatherLabel);
    text('citySelectionStatus','Επιλέχθηκε: '+city.name+', επίπεδο '+selected+'.');
    text('cityStartLabel','ΠΑΙΞΕ · LEVEL '+String(selected).padStart(2,'0'));
    setPage(Math.floor((selected-1)/pageSize));
    onSelect(city);if(sound)onSound('menuFocus');if(focus)focusSelected();
  }
  function resize(){
    // Portrait: four readable images. Wide screens: six. Very short screens
    // remain two rows, rather than adding a scrollbar or shrinking touch areas.
    const width=win?.innerWidth??1024,height=win?.innerHeight??768;
    const size=width<600||height<360?4:6;
    if(size!==pageSize){pageSize=size;grid.dataset.columns=pageSize===4?'2':'3';setPage(Math.floor((selected-1)/pageSize));}
  }
  for(const city of LEVEL_CITIES){
    const card=make('button','city-card');card.type='button';card.dataset.level=String(city.level);
    card.id='city-level-'+city.level;card.setAttribute('aria-label','Επίπεδο '+city.level+' · '+city.name+' · '+city.weatherLabel);
    card.setAttribute('aria-pressed','false');
    const image=make('img','city-card-image');image.src=city.image;image.alt='';image.width=640;image.height=400;image.loading='lazy';image.decoding='async';
    const number=make('span','city-card-number',String(city.level).padStart(2,'0'));
    const tick=make('span','city-card-check','✓');tick.setAttribute('aria-hidden','true');
    const label=make('span','city-card-copy');label.appendChild(make('strong','',city.name));label.appendChild(make('small','',city.weatherLabel));
    card.appendChild(image);card.appendChild(number);card.appendChild(tick);card.appendChild(label);
    listen(card,'click',()=>select(city.level));
    listen(card,'keydown',event=>{
      const columns=pageSize===4?2:3;
      const next={ArrowRight:city.level+1,ArrowLeft:city.level-1,ArrowDown:city.level+columns,ArrowUp:city.level-columns,Home:1,End:15}[event.key];
      if(next!==undefined){event.preventDefault();event.stopPropagation();select(next,{focus:true});}
      if(event.key==='PageDown'||event.key==='PageUp'){event.preventDefault();event.stopPropagation();setPage(page+(event.key==='PageDown'?1:-1),true);}
    });
    grid.appendChild(card);cards.push(card);
  }
  for(let i=0;i<4;i++){
    const button=make('button','city-page-dot');button.type='button';button.setAttribute('aria-label','Σελίδα πόλεων '+(i+1));
    listen(button,'click',()=>setPage(i));$('cityPageDots')?.appendChild(button);pageButtons.push(button);
  }
  listen($('cityPrevious'),'click',()=>{setPage(page-1);onSound('menuFocus');});
  listen($('cityNext'),'click',()=>{setPage(page+1);onSound('menuFocus');});
  listen(win,'resize',resize);resize();select(selected,{sound:false});
  return {open(){resize();setPage(Math.floor((selected-1)/pageSize));focusSelected();},
    get selected(){return getLevelCity(selected);},select,
    dispose(){for(const remove of removers)remove();for(const node of [...cards,...pageButtons])node.remove?.();}};
}
