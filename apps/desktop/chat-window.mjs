import {renderChat} from './chat-view.mjs';
const render=s=>renderChat(document.getElementById('chat-view'),s,window.petlink.call);window.petlink.subscribe(render);render(await window.petlink.call('snapshot'));document.getElementById('close').onclick=()=>window.petlink.call('chat-close');
